const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validate, validateId } = require('../middleware/validate');
const { inboundCreate, outboundCreate, transferCreate } = require('../validators/schemas');
const { writeLog } = require('./logs');
const { generateOrderNo } = require('../utils/order-number');
const { convertToKg } = require('../utils/unit-convert');
const { createReceivable } = require('./finance');
const { BusinessError } = require('../utils/BusinessError');


// ==================== 仓库 ====================
router.get('/warehouses', requirePermission('warehouse_view'), async (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM warehouses WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY id';
    const warehouses = await req.db.all(sql, params);
    res.json({ success: true, data: warehouses });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 库存查询 ====================
router.get('/inventory', requirePermission('warehouse_view'), async (req, res) => {
  try {
    const { warehouse_type, category, product_id, warehouse_id } = req.query;
    let sql = `
      SELECT i.*, p.code, p.name as product_name, p.specification, p.unit, p.category, p.stock_threshold as alert_threshold, w.name as warehouse_name, w.type as warehouse_type
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE i.quantity > 0
    `;
    const params = [];
    if (warehouse_type) { sql += ' AND w.type = ?'; params.push(warehouse_type); }
    if (category) { sql += ' AND p.category = ?'; params.push(category); }
    if (product_id) { sql += ' AND i.product_id = ?'; params.push(product_id); }
    if (warehouse_id) { sql += ' AND i.warehouse_id = ?'; params.push(warehouse_id); }
    
    // 如果查询特定产品批次，按更新时间正序(FIFO)，否则倒序
    if (product_id) {
      sql += ' ORDER BY i.updated_at ASC';
    } else {
      sql += ' ORDER BY i.updated_at DESC';
    }
    const inventory = await req.db.all(sql, params);
    res.json({ success: true, data: inventory });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 库存预警
router.get('/inventory/warnings', requirePermission('warehouse_view'), async (req, res) => {
  try {
    const warnings = await req.db.all(`
      SELECT SUM(i.quantity) as quantity, p.code, p.name, p.unit, p.stock_threshold, w.name as warehouse_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE p.stock_threshold > 0
      GROUP BY i.warehouse_id, i.product_id, p.code, p.name, p.unit, p.stock_threshold, w.name
      HAVING SUM(i.quantity) < p.stock_threshold
      ORDER BY quantity ASC
    `);
    res.json({ success: true, data: warnings });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 入库单 ====================
router.get('/inbound', requirePermission('warehouse_view'), async (req, res) => {
  try {
    const { type, status, page = 1, pageSize = 20 } = req.query;
    let sql = `
      SELECT io.*, w.name as warehouse_name, s.name as supplier_name
      FROM inbound_orders io
      JOIN warehouses w ON io.warehouse_id = w.id
      LEFT JOIN suppliers s ON io.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];
    if (type) { sql += ' AND io.type = ?'; params.push(type); }
    if (status) { sql += ' AND io.status = ?'; params.push(status); }
    sql += ' ORDER BY io.created_at DESC';
    const result = await req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/inbound/:id', validateId, requirePermission('warehouse_view'), async (req, res) => {
  try {
    const order = await req.db.get(`
      SELECT io.*, w.name as warehouse_name, s.name as supplier_name
      FROM inbound_orders io
      JOIN warehouses w ON io.warehouse_id = w.id
      LEFT JOIN suppliers s ON io.supplier_id = s.id
      WHERE io.id = ?
    `, [req.params.id]);
    const items = await req.db.all(`
      SELECT ii.*, p.code, p.name, p.specification, p.unit
      FROM inbound_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.inbound_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/inbound', requirePermission('warehouse_create'), validate(inboundCreate), async (req, res) => {
  try {
    const { type, warehouse_id, supplier_id, items, operator, remark } = req.body;
    if (!warehouse_id) return res.status(400).json({ success: false, message: '请选择仓库' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: '请至少选择一个产品' });
    
    const prefix = type === 'raw' ? 'RK' : type === 'semi' ? 'BC' : 'CP';
    const orderNo = generateOrderNo(prefix);
    
    // 预取产品信息，避免循环内重复查询
    const productIds = [...new Set(items.map(i => i.product_id))];
    const productMap = new Map();
    for (const id of productIds) {
      const p = await req.db.get('SELECT unit, outer_diameter, wall_thickness, length FROM products WHERE id = ?', [id]);
      if (p) productMap.set(id, p);
    }
    
    let totalAmount = 0;
    items.forEach(item => {
      const product = productMap.get(item.product_id);
      const inputUnit = product?.unit || '公斤';
      const quantityKg = convertToKg(item.input_quantity || item.quantity, inputUnit, product);
      totalAmount += quantityKg * (item.unit_price || 0);
    });
    
    let inboundId;
    await req.db.transaction(async () => {
      const result = await req.db.run(`
        INSERT INTO inbound_orders (order_no, type, warehouse_id, supplier_id, total_amount, operator, remark, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_inspection')
      `, [orderNo, type, warehouse_id, supplier_id, totalAmount, operator, remark]);
      inboundId = result.lastInsertRowid;
      
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const product = productMap.get(item.product_id);
        const inputUnit = product?.unit || '公斤';
        const inputQuantity = item.input_quantity || item.quantity;
        const quantityKg = convertToKg(inputQuantity, inputUnit, product);
        const batchNo = `${orderNo}-${index + 1}`;
        await req.db.run('INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, input_quantity, input_unit, unit_price, supplier_batch_no, heat_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [inboundId, item.product_id, batchNo, quantityKg, inputQuantity, inputUnit, item.unit_price || 0, item.supplier_batch_no || null, item.heat_no || null]);
      }
    });
    res.json({ success: true, data: { id: inboundId, order_no: orderNo } });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/inbound/:id/status', validateId, requirePermission('warehouse_edit'), async (req, res) => {
  try {
    const { status } = req.body;
    // 【安全】状态值白名单校验
    const validStatuses = ['pending_inspection', 'approved', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    
    await req.db.transaction(async () => {
      const order = await req.db.get('SELECT * FROM inbound_orders WHERE id = ? FOR UPDATE', [req.params.id]);
      // 【修复#1】查询入库明细（原代码遗漏此行导致运行时崩溃）
      const items = await req.db.all('SELECT * FROM inbound_items WHERE inbound_id = ?', [req.params.id]);
      // 【联动#2防重】只有从非完成状态变为 completed/approved 时才增加库存
      const alreadyStocked = order && (order.status === 'completed' || order.status === 'approved');
      if ((status === 'completed' || status === 'approved') && !alreadyStocked && items.length > 0) {
        // N+1优化：批量预加载库存
        const productIds = [...new Set(items.map(i => i.product_id))];
        const ph = productIds.map(() => '?').join(',');
        const existingInvRows = await req.db.all(`SELECT * FROM inventory WHERE warehouse_id = ? AND product_id IN (${ph})`, [order.warehouse_id, ...productIds]);
        const invMap = {};
        for(let row of existingInvRows) {
          invMap[`${row.product_id}_${row.batch_no}`] = row;
        }

        for (const item of items) {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          const key = `${item.product_id}_${batch}`;
          if (invMap[key]) {
            await req.db.run('UPDATE inventory SET quantity = quantity + ?, supplier_batch_no = COALESCE(?, supplier_batch_no), heat_no = COALESCE(?, heat_no), updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, item.supplier_batch_no || null, item.heat_no || null, invMap[key].id]);
            // 更新内存态防止同一批次重复叠加判断
            invMap[key].quantity += item.quantity;
          } else {
            const result = await req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity, supplier_batch_no, heat_no) VALUES (?, ?, ?, ?, ?, ?)', [order.warehouse_id, item.product_id, batch, item.quantity, item.supplier_batch_no || null, item.heat_no || null]);
            invMap[key] = { id: result.lastInsertRowid, quantity: item.quantity };
          }
        }
      }
      await req.db.run('UPDATE inbound_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/inbound/:id', validateId, requirePermission('warehouse_edit'), async (req, res) => {
  try {
    const { warehouse_id, supplier_id, operator, remark, items } = req.body;
    // 【安全】禁止编辑已入库的单据（库存已变动）
    const existingOrder = await req.db.get('SELECT * FROM inbound_orders WHERE id = ?', [req.params.id]);
    if (!existingOrder) return res.status(404).json({ success: false, message: '入库单不存在' });
    if (existingOrder.status === 'completed' || existingOrder.status === 'approved') {
      return res.status(400).json({ success: false, message: '已入库的单据不能修改，如需调整请创建新单据' });
    }
    const productIds = [...new Set(items.map(i => i.product_id))];
    const productMap = new Map();
    for (const id of productIds) {
      const p = await req.db.get('SELECT unit, outer_diameter, wall_thickness, length FROM products WHERE id = ?', [id]);
      if (p) productMap.set(id, p);
    }
    
    await req.db.transaction(async () => {
      const baseOrderNo = existingOrder.order_no || `MOD-${req.params.id}`;
      
      await req.db.run('UPDATE inbound_orders SET warehouse_id = ?, supplier_id = ?, operator = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [warehouse_id, supplier_id || null, operator, remark, req.params.id]);
      await req.db.run('DELETE FROM inbound_items WHERE inbound_id = ?', [req.params.id]);
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const product = productMap.get(item.product_id);
        const inputUnit = product?.unit || '公斤';
        const inputQuantity = item.input_quantity || item.quantity;
        const quantityKg = convertToKg(inputQuantity, inputUnit, product);
        const batchNo = item.batch_no || `${baseOrderNo}-${index + 1}`;
        await req.db.run('INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, input_quantity, input_unit, unit_price, supplier_batch_no, heat_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, batchNo, quantityKg, inputQuantity, inputUnit, item.unit_price || 0, item.supplier_batch_no || null, item.heat_no || null]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/inbound/:id', validateId, requirePermission('warehouse_delete'), async (req, res) => {
  try {
    const { force } = req.query;
    const order = await req.db.get('SELECT * FROM inbound_orders WHERE id = ?', [req.params.id]);
    const isAdmin = req.user?.role_code === 'admin';
    const isForce = req.query.force === 'true';
    if (order && (order.status === 'completed' || order.status === 'approved')) {
      if (!(isAdmin && isForce)) {
        return res.status(400).json({ success: false, message: '已入库的单据不能删除，如需硬删除请使用管理员账号并添加 force=true' });
      }
    }
    
    await req.db.transaction(async () => {
      // 仅对已入库的单据回滚库存
      if (order && (order.status === 'completed' || order.status === 'approved')) {
        const items = await req.db.all('SELECT * FROM inbound_items WHERE inbound_id = ?', [req.params.id]);
        for (const item of items) {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          const inventory = await req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [order.warehouse_id, item.product_id, batch]);
          if (inventory && inventory.quantity > 0) {
            const newQty = Math.max(0, inventory.quantity - item.quantity);
            await req.db.run('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newQty, inventory.id]);
            if (newQty <= 0) {
              await req.db.run('DELETE FROM inventory WHERE id = ?', [inventory.id]);
            }
          }
        }
      }
      // 清理关联的检验记录（防止外键约束失败）
      await req.db.run('DELETE FROM inbound_inspections WHERE inbound_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM inbound_items WHERE inbound_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM inbound_orders WHERE id = ?', [req.params.id]);
    });
    writeLog(req.db, req.user?.id, '删除入库单', 'inbound', req.params.id, `入库单号: ${order?.order_no || req.params.id}，状态: ${order?.status}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 出库单 ====================
router.get('/outbound', requirePermission('warehouse_view'), async (req, res) => {
  try {
    const { type, status, page = 1, pageSize = 20 } = req.query;
    let sql = `
      SELECT oo.*, w.name as warehouse_name, o.order_no as sales_order_no
      FROM outbound_orders oo
      JOIN warehouses w ON oo.warehouse_id = w.id
      LEFT JOIN orders o ON oo.order_id = o.id
      WHERE 1=1
    `;
    const params = [];
    if (type) { sql += ' AND oo.type = ?'; params.push(type); }
    if (status) { sql += ' AND oo.status = ?'; params.push(status); }
    sql += ' ORDER BY oo.created_at DESC';
    const result = await req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/outbound/:id', validateId, requirePermission('warehouse_view'), async (req, res) => {
  try {
    const order = await req.db.get(`
      SELECT oo.*, w.name as warehouse_name, o.order_no as ref_order_no, o.customer_name
      FROM outbound_orders oo
      JOIN warehouses w ON oo.warehouse_id = w.id
      LEFT JOIN orders o ON oo.order_id = o.id
      WHERE oo.id = ?
    `, [req.params.id]);
    const items = await req.db.all(`
      SELECT oi.*, p.code, p.name, p.specification, p.unit
      FROM outbound_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.outbound_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/outbound', requirePermission('warehouse_create'), validate(outboundCreate), async (req, res) => {
  try {
    const { type, warehouse_id, order_id, items, operator, remark } = req.body;
    if (!warehouse_id) return res.status(400).json({ success: false, message: '请选择仓库' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: '请至少选择一个产品' });
    
    const prefix = type === 'raw' ? 'CK' : type === 'semi' ? 'SC' : 'CC';
    const orderNo = generateOrderNo(prefix);
    
    // 预取产品信息
    const productIds = [...new Set(items.map(i => i.product_id))];
    const productMap = new Map();
    for (const id of productIds) {
      const p = await req.db.get('SELECT unit, outer_diameter, wall_thickness, length FROM products WHERE id = ?', [id]);
      if (p) productMap.set(id, p);
    }
    
    let totalAmount = 0;
    items.forEach(item => {
      const product = productMap.get(item.product_id);
      const quantityKg = convertToKg(item.input_quantity || item.quantity, item.input_unit || '公斤', product);
      totalAmount += quantityKg * (item.unit_price || 0);
    });
    
    let outboundId;
    await req.db.transaction(async () => {
      const result = await req.db.run(`
        INSERT INTO outbound_orders (order_no, type, warehouse_id, order_id, total_amount, operator, remark, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `, [orderNo, type, warehouse_id, order_id || null, totalAmount, operator, remark]);
      outboundId = result.lastInsertRowid;
      
      for (const item of items) {
        const product = productMap.get(item.product_id);
        const inputUnit = product?.unit || '公斤';
        const inputQuantity = item.input_quantity || item.quantity;
        const quantityKg = convertToKg(inputQuantity, inputUnit, product);
        const batchNo = item.batch_no || 'DEFAULT_BATCH';
        
        // 校验库存并增加锁定数量
        const inv = await req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [warehouse_id, item.product_id, batchNo]);
        const lockedQty = inv?.locked_quantity || 0;
        if (!inv || (inv.quantity - lockedQty) < quantityKg) {
           throw new BusinessError(`${product?.name || '产品'} (批次: ${batchNo}) 可用库存不足`);
        }
        await req.db.run('UPDATE inventory SET locked_quantity = COALESCE(locked_quantity, 0) + ? WHERE id = ?', [quantityKg, inv.id]);

        await req.db.run('INSERT INTO outbound_items (outbound_id, product_id, batch_no, quantity, input_quantity, input_unit, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [outboundId, item.product_id, batchNo, quantityKg, inputQuantity, inputUnit, item.unit_price || 0]);
      }
    });
    res.json({ success: true, data: { id: outboundId, order_no: orderNo } });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/outbound/:id/status', validateId, requirePermission('warehouse_edit'), async (req, res) => {
  try {
    const { status } = req.body;
    // 【安全】状态值白名单校验
    const validStatuses = ['pending', 'approved', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    await req.db.transaction(async () => {
      const order = await req.db.get('SELECT * FROM outbound_orders WHERE id = ? FOR UPDATE', [req.params.id]);
      // 【防呆防重复】加入乐观锁，必须是 pending 或 approved 状态才能扣库存
      if (status === 'completed' || status === 'approved') {
        const updateResult = await req.db.run("UPDATE outbound_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending', 'approved')", [status, req.params.id]);
        if (updateResult.changes === 0) {
           throw new BusinessError('单据状态已变更，请刷新后重试');
        }

        const items = await req.db.all('SELECT * FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
        if (items.length > 0) {
          // 确认出库：核销真实的物理库存，同时释放之前锁定的库存
          for (const item of items) {
            const batch = item.batch_no || 'DEFAULT_BATCH';
            await req.db.run('UPDATE inventory SET quantity = quantity - ?, locked_quantity = COALESCE(locked_quantity, 0) - ?, updated_at = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [item.quantity, item.quantity, order.warehouse_id, item.product_id, batch]);
          }
        }
        
        // 【改进#6】成品出库完成后更新关联订单为已发货 + 生成应收账款
        if (order.type === 'finished' && order.order_id) {
          const salesOrder = await req.db.get('SELECT * FROM orders WHERE id = ?', [order.order_id]);
          if (salesOrder) {
            let currentTotalAmount = 0;
            for (const item of items) {
              await req.db.run('UPDATE order_items SET shipped_quantity = COALESCE(shipped_quantity, 0) + ? WHERE order_id = ? AND product_id = ?', [item.quantity, order.order_id, item.product_id]);
              currentTotalAmount += item.quantity * (item.unit_price || 0);
            }
            
            const allItems = await req.db.all('SELECT quantity, COALESCE(shipped_quantity, 0) as shipped_quantity FROM order_items WHERE order_id = ?', [order.order_id]);
            let allShipped = true;
            let hasShipped = false;
            for (const oi of allItems) {
              if (oi.shipped_quantity > 0) hasShipped = true;
              if (oi.shipped_quantity < oi.quantity) allShipped = false;
            }
            
            let newStatus = salesOrder.status;
            if (allShipped) newStatus = 'shipped';
            else if (hasShipped) newStatus = 'partial_shipped';

            await req.db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, order.order_id]);

            // 财务联动：自动生成应收账款
            if (currentTotalAmount > 0) {
              await createReceivable(req.db, {
                type: '销售应收',
                sourceType: 'order',
                sourceId: order.order_id,
                customerId: salesOrder.customer_id,
                amount: currentTotalAmount,
                remark: `订单 ${salesOrder.order_no} 生产完工出库自动生成`
              });
            }
          }
        }
      } else {
        // 如果是其他状态变动，不涉及库存核销，普通更新即可
        await req.db.run('UPDATE outbound_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    if (error instanceof BusinessError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/outbound/:id', validateId, requirePermission('warehouse_edit'), async (req, res) => {
  try {
    const { warehouse_id, order_id, operator, remark, items } = req.body;
    // 【安全】禁止编辑已出库的单据（库存已变动）
    const existingOrder = await req.db.get('SELECT * FROM outbound_orders WHERE id = ?', [req.params.id]);
    if (!existingOrder) return res.status(404).json({ success: false, message: '出库单不存在' });
    if (existingOrder.status === 'completed' || existingOrder.status === 'approved') {
      return res.status(400).json({ success: false, message: '已出库的单据不能修改' });
    }
    const productIds = [...new Set(items.map(i => i.product_id))];
    const productMap = new Map();
    for (const id of productIds) {
      const p = await req.db.get('SELECT unit, outer_diameter, wall_thickness, length FROM products WHERE id = ?', [id]);
      if (p) productMap.set(id, p);
    }
    
    await req.db.transaction(async () => {
      await req.db.run('UPDATE outbound_orders SET warehouse_id = ?, order_id = ?, operator = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [warehouse_id, order_id || null, operator, remark, req.params.id]);
      
      const oldItems = await req.db.all('SELECT * FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
      // 释放旧明细的锁定库存
      for (const old of oldItems) {
        const batchNo = old.batch_no || 'DEFAULT_BATCH';
        await req.db.run('UPDATE inventory SET locked_quantity = COALESCE(locked_quantity, 0) - ? WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [old.quantity, existingOrder.warehouse_id, old.product_id, batchNo]);
      }
      await req.db.run('DELETE FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
      
      // 增加新明细的锁定库存
      for (const item of items) {
        const product = productMap.get(item.product_id);
        const inputUnit = product?.unit || '公斤';
        const inputQuantity = item.input_quantity || item.quantity;
        const quantityKg = convertToKg(inputQuantity, inputUnit, product);
        const batchNo = item.batch_no || 'DEFAULT_BATCH';
        
        // 校验库存
        const inv = await req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [warehouse_id, item.product_id, batchNo]);
        const lockedQty = inv?.locked_quantity || 0;
        if (!inv || (inv.quantity - lockedQty) < quantityKg) {
           throw new BusinessError(`${product?.name || '产品'} (批次: ${batchNo}) 可用库存不足`);
        }
        await req.db.run('UPDATE inventory SET locked_quantity = COALESCE(locked_quantity, 0) + ? WHERE id = ?', [quantityKg, inv.id]);

        await req.db.run('INSERT INTO outbound_items (outbound_id, product_id, batch_no, quantity, input_quantity, input_unit, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, batchNo, quantityKg, inputQuantity, inputUnit, item.unit_price || 0]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/outbound/:id', validateId, requirePermission('warehouse_delete'), async (req, res) => {
  try {
    const { force } = req.query;
    const order = await req.db.get('SELECT * FROM outbound_orders WHERE id = ?', [req.params.id]);
    const isAdmin = req.user?.role_code === 'admin';
    const isForce = req.query.force === 'true';
    if (order && order.status === 'completed') {
      if (!(isAdmin && isForce)) {
        return res.status(400).json({ success: false, message: '已出库的单据不能删除，如需硬删除请使用管理员账号并添加 force=true' });
      }
    }
    
    await req.db.transaction(async () => {
      const items = await req.db.all('SELECT * FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
      // 仅对已出库的单据回滚物理库存（出库=加回库存）
      if (order && (order.status === 'completed' || order.status === 'approved')) {
        for (const item of items) {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          const inventory = await req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [order.warehouse_id, item.product_id, batch]);
          if (inventory) {
            await req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, inventory.id]);
          } else {
            await req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [order.warehouse_id, item.product_id, batch, item.quantity]);
          }
        }
      } else {
        // 对于未完成（pending）的单据，释放 locked_quantity
        for (const item of items) {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          await req.db.run('UPDATE inventory SET locked_quantity = COALESCE(locked_quantity, 0) - ? WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [item.quantity, order.warehouse_id, item.product_id, batch]);
        }
      }
      await req.db.run('DELETE FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM outbound_orders WHERE id = ?', [req.params.id]);
    });
    writeLog(req.db, req.user?.id, '删除出库单', 'outbound', req.params.id, `出库单号: ${order?.order_no || req.params.id}，状态: ${order?.status}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 仓库间调拨 ====================
router.get('/transfer', requirePermission('warehouse_view'), async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT oo.*, w1.name as from_warehouse_name, w2.name as to_warehouse_name
      FROM outbound_orders oo
      JOIN warehouses w1 ON oo.warehouse_id = w1.id
      LEFT JOIN warehouses w2 ON oo.target_warehouse_id = w2.id
      WHERE oo.type = 'transfer'
    `;
    const params = [];
    if (status) { sql += ' AND oo.status = ?'; params.push(status); }
    sql += ' ORDER BY oo.created_at DESC';
    // 调拨单量少，全量返回，前端无需分页
    const data = await req.db.all(sql, params);
    res.json({ success: true, data });
  } catch (error) {
    console.error(`[warehouse.js transfer]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});


router.get('/transfer/:id', validateId, requirePermission('warehouse_view'), async (req, res) => {
  try {
    const order = await req.db.get(`
      SELECT oo.*, w1.name as from_warehouse_name, w2.name as to_warehouse_name
      FROM outbound_orders oo
      JOIN warehouses w1 ON oo.warehouse_id = w1.id
      LEFT JOIN warehouses w2 ON oo.target_warehouse_id = w2.id
      WHERE oo.id = ? AND oo.type = 'transfer'
    `, [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '调拨单不存在' });
    const items = await req.db.all(`
      SELECT oi.*, p.code, p.name, p.specification, p.unit
      FROM outbound_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.outbound_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error(`[warehouse.js transfer]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/transfer', requirePermission('warehouse_create'), validate(transferCreate), async (req, res) => {

  try {
    const { from_warehouse_id, to_warehouse_id, items, operator, remark } = req.body;
    if (!from_warehouse_id || !to_warehouse_id) return res.status(400).json({ success: false, message: '请选择源仓库和目标仓库' });
    if (String(from_warehouse_id) === String(to_warehouse_id)) return res.status(400).json({ success: false, message: '源仓库和目标仓库不能相同' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: '请至少选择一个产品' });

    const orderNo = generateOrderNo('DB');
    let transferId;

    await req.db.transaction(async () => {
      // 创建调拨出库单
      const result = await req.db.run(`
        INSERT INTO outbound_orders (order_no, type, warehouse_id, target_warehouse_id, operator, remark, status)
        VALUES (?, 'transfer', ?, ?, ?, ?, 'pending')
      `, [orderNo, from_warehouse_id, to_warehouse_id, operator, remark]);
      transferId = result.lastInsertRowid;

      for (const item of items) {
        const batchNo = item.batch_no || 'DEFAULT_BATCH';
        await req.db.run('INSERT INTO outbound_items (outbound_id, product_id, batch_no, quantity, input_quantity, input_unit) VALUES (?, ?, ?, ?, ?, ?)',
          [transferId, item.product_id, batchNo, item.quantity, item.input_quantity || item.quantity, item.input_unit || '公斤']);
      }
    });

    writeLog(req.db, req.user?.id, '创建调拨单', 'transfer', transferId, `调拨单号: ${orderNo}`);
    res.json({ success: true, data: { id: transferId, order_no: orderNo } });
  } catch (error) {
    console.error(`[warehouse.js transfer]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/transfer/:id/confirm', validateId, requirePermission('warehouse_edit'), async (req, res) => {
  try {
    await req.db.transaction(async () => {
      const order = await req.db.get('SELECT * FROM outbound_orders WHERE id = ? AND type = ? FOR UPDATE', [req.params.id, 'transfer']);
      if (!order) throw new BusinessError('调拨单不存在');
      if (order.status === 'completed') throw new BusinessError('该调拨单已完成');

      const items = await req.db.all('SELECT * FROM outbound_items WHERE outbound_id = ?', [req.params.id]);

      if (items.length > 0) {
        // N+1优化：批量预加载源与目标的库存
        const productIds = [...new Set(items.map(i => i.product_id))];
        const ph = productIds.map(() => '?').join(',');
        const sourceInvRows = await req.db.all(`SELECT * FROM inventory WHERE warehouse_id = ? AND product_id IN (${ph})`, [order.warehouse_id, ...productIds]);
        const targetInvRows = await req.db.all(`SELECT * FROM inventory WHERE warehouse_id = ? AND product_id IN (${ph})`, [order.target_warehouse_id, ...productIds]);
        const pRows = await req.db.all(`SELECT id, name FROM products WHERE id IN (${ph})`, productIds);
        
        const sourceInvMap = {};
        const targetInvMap = {};
        for(let r of sourceInvRows) sourceInvMap[`${r.product_id}_${r.batch_no}`] = r;
        for(let r of targetInvRows) targetInvMap[`${r.product_id}_${r.batch_no}`] = r;
        const pMap = {};
        for(let p of pRows) pMap[p.id] = p;

        // 内存校验扣减源仓
        for (const item of items) {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          const key = `${item.product_id}_${batch}`;
          const inv = sourceInvMap[key];
          if (!inv || inv.quantity < item.quantity) {
            throw new BusinessError(`${pMap[item.product_id]?.name || '产品'} (批次: ${batch}) 源仓库库存不足`);
          }
          inv.quantity -= item.quantity;
        }

        // 修改库表（源和目标）
        for (const item of items) {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          const key = `${item.product_id}_${batch}`;
          // 减源仓
          await req.db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [item.quantity, order.warehouse_id, item.product_id, batch]);
          // 加目标仓
          if (targetInvMap[key]) {
            await req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, targetInvMap[key].id]);
            targetInvMap[key].quantity += item.quantity; // 同步更新避免同一批次冲突
          } else {
            const result = await req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [order.target_warehouse_id, item.product_id, batch, item.quantity]);
            targetInvMap[key] = { id: result.lastInsertRowid, quantity: item.quantity };
          }
        }
      }

      await req.db.run('UPDATE outbound_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['completed', req.params.id]);
    });

    writeLog(req.db, req.user?.id, '确认调拨', 'transfer', req.params.id, '调拨完成');
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js transfer]`, error.message);
    if (error instanceof BusinessError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/transfer/:id', validateId, requirePermission('warehouse_delete'), async (req, res) => {
  try {
    const order = await req.db.get('SELECT * FROM outbound_orders WHERE id = ? AND type = ?', [req.params.id, 'transfer']);
    if (!order) return res.status(404).json({ success: false, message: '调拨单不存在' });
    if (order.status === 'completed') return res.status(400).json({ success: false, message: '已完成的调拨单不能删除' });

    await req.db.transaction(async () => {
      await req.db.run('DELETE FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM outbound_orders WHERE id = ?', [req.params.id]);
    });

    writeLog(req.db, req.user?.id, '删除调拨单', 'transfer', req.params.id, `调拨单号: ${order.order_no}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js transfer]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
