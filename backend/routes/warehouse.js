const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validate, validateId } = require('../middleware/validate');
const { inboundCreate, outboundCreate } = require('../validators/schemas');
const { writeLog } = require('./logs');
const { generateOrderNo } = require('../utils/order-number');
const { convertToKg } = require('../utils/unit-convert');

// ==================== 仓库 ====================
router.get('/warehouses', requirePermission('warehouse_view'), (req, res) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM warehouses WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY id';
    const warehouses = req.db.all(sql, params);
    res.json({ success: true, data: warehouses });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 库存查询 ====================
router.get('/inventory', requirePermission('warehouse_view'), (req, res) => {
  try {
    const { warehouse_type, category } = req.query;
    let sql = `
      SELECT i.*, p.code, p.name as product_name, p.specification, p.unit, p.category, p.stock_threshold as alert_threshold, w.name as warehouse_name, w.type as warehouse_type
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE 1=1
    `;
    const params = [];
    if (warehouse_type) { sql += ' AND w.type = ?'; params.push(warehouse_type); }
    if (category) { sql += ' AND p.category = ?'; params.push(category); }
    sql += ' ORDER BY i.updated_at DESC';
    const inventory = req.db.all(sql, params);
    res.json({ success: true, data: inventory });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 库存预警
router.get('/inventory/warnings', requirePermission('warehouse_view'), (req, res) => {
  try {
    const warnings = req.db.all(`
      SELECT SUM(i.quantity) as quantity, p.code, p.name, p.unit, p.stock_threshold, w.name as warehouse_name
      FROM inventory i
      JOIN products p ON i.product_id = p.id
      JOIN warehouses w ON i.warehouse_id = w.id
      WHERE p.stock_threshold > 0
      GROUP BY i.warehouse_id, i.product_id
      HAVING quantity < p.stock_threshold
      ORDER BY quantity ASC
    `);
    res.json({ success: true, data: warnings });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 入库单 ====================
router.get('/inbound', requirePermission('warehouse_view'), (req, res) => {
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
    const result = req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/inbound/:id', validateId, requirePermission('warehouse_view'), (req, res) => {
  try {
    const order = req.db.get(`
      SELECT io.*, w.name as warehouse_name, s.name as supplier_name
      FROM inbound_orders io
      JOIN warehouses w ON io.warehouse_id = w.id
      LEFT JOIN suppliers s ON io.supplier_id = s.id
      WHERE io.id = ?
    `, [req.params.id]);
    const items = req.db.all(`
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

router.post('/inbound', requirePermission('warehouse_create'), validate(inboundCreate), (req, res) => {
  try {
    const { type, warehouse_id, supplier_id, items, operator, remark } = req.body;
    if (!warehouse_id) return res.status(400).json({ success: false, message: '请选择仓库' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: '请至少选择一个产品' });
    
    const prefix = type === 'raw' ? 'RK' : type === 'semi' ? 'BC' : 'CP';
    const orderNo = generateOrderNo(prefix);
    
    // 预取产品信息，避免循环内重复查询
    const productIds = [...new Set(items.map(i => i.product_id))];
    const productMap = new Map();
    productIds.forEach(id => {
      const p = req.db.get('SELECT unit, outer_diameter, wall_thickness, length FROM products WHERE id = ?', [id]);
      if (p) productMap.set(id, p);
    });
    
    let totalAmount = 0;
    items.forEach(item => {
      const product = productMap.get(item.product_id);
      const inputUnit = product?.unit || '公斤';
      const quantityKg = convertToKg(item.input_quantity || item.quantity, inputUnit, product);
      totalAmount += quantityKg * (item.unit_price || 0);
    });
    
    let inboundId;
    req.db.transaction(() => {
      const result = req.db.run(`
        INSERT INTO inbound_orders (order_no, type, warehouse_id, supplier_id, total_amount, operator, remark, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_inspection')
      `, [orderNo, type, warehouse_id, supplier_id, totalAmount, operator, remark]);
      inboundId = result.lastInsertRowid;
      
      items.forEach((item, index) => {
        const product = productMap.get(item.product_id);
        const inputUnit = product?.unit || '公斤';
        const inputQuantity = item.input_quantity || item.quantity;
        const quantityKg = convertToKg(inputQuantity, inputUnit, product);
        const batchNo = `${orderNo}-${index + 1}`;
        req.db.run('INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, input_quantity, input_unit, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [inboundId, item.product_id, batchNo, quantityKg, inputQuantity, inputUnit, item.unit_price || 0]);
      });
    });
    res.json({ success: true, data: { id: inboundId, order_no: orderNo } });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/inbound/:id/status', validateId, requirePermission('warehouse_edit'), (req, res) => {
  try {
    const { status } = req.body;
    // 【安全】状态值白名单校验
    const validStatuses = ['pending_inspection', 'approved', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    
    req.db.transaction(() => {
      const order = req.db.get('SELECT * FROM inbound_orders WHERE id = ?', [req.params.id]);
      // 【修复#1】查询入库明细（原代码遗漏此行导致运行时崩溃）
      const items = req.db.all('SELECT * FROM inbound_items WHERE inbound_id = ?', [req.params.id]);
      // 【联动#2防重】只有从非完成状态变为 completed/approved 时才增加库存
      const alreadyStocked = order && (order.status === 'completed' || order.status === 'approved');
      if ((status === 'completed' || status === 'approved') && !alreadyStocked) {
        items.forEach(item => {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          const existing = req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [order.warehouse_id, item.product_id, batch]);
          if (existing) {
            req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, existing.id]);
          } else {
            req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [order.warehouse_id, item.product_id, batch, item.quantity]);
          }
        });
      }
      req.db.run('UPDATE inbound_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/inbound/:id', validateId, requirePermission('warehouse_edit'), (req, res) => {
  try {
    const { warehouse_id, supplier_id, operator, remark, items } = req.body;
    
    const productIds = [...new Set(items.map(i => i.product_id))];
    const productMap = new Map();
    productIds.forEach(id => {
      const p = req.db.get('SELECT unit, outer_diameter, wall_thickness, length FROM products WHERE id = ?', [id]);
      if (p) productMap.set(id, p);
    });
    
    req.db.transaction(() => {
      const existingOrder = req.db.get('SELECT order_no FROM inbound_orders WHERE id = ?', [req.params.id]);
      const baseOrderNo = existingOrder ? existingOrder.order_no : `MOD-${req.params.id}`;
      
      req.db.run('UPDATE inbound_orders SET warehouse_id = ?, supplier_id = ?, operator = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [warehouse_id, supplier_id || null, operator, remark, req.params.id]);
      req.db.run('DELETE FROM inbound_items WHERE inbound_id = ?', [req.params.id]);
      items.forEach((item, index) => {
        const product = productMap.get(item.product_id);
        const inputUnit = product?.unit || '公斤';
        const inputQuantity = item.input_quantity || item.quantity;
        const quantityKg = convertToKg(inputQuantity, inputUnit, product);
        const batchNo = item.batch_no || `${baseOrderNo}-${index + 1}`;
        req.db.run('INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, input_quantity, input_unit, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, batchNo, quantityKg, inputQuantity, inputUnit, item.unit_price || 0]);
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/inbound/:id', validateId, requirePermission('warehouse_delete'), (req, res) => {
  try {
    const { force } = req.query;
    const order = req.db.get('SELECT * FROM inbound_orders WHERE id = ?', [req.params.id]);
    const isAdmin = req.user?.role_code === 'admin';
    if (order && (order.status === 'completed' || order.status === 'approved') && force !== 'true' && !isAdmin) {
      return res.status(400).json({ success: false, message: '已入库的单据不能删除，如需删除请联系管理员' });
    }
    
    req.db.transaction(() => {
      // 仅对已入库的单据回滚库存
      if (order && (order.status === 'completed' || order.status === 'approved')) {
        const items = req.db.all('SELECT * FROM inbound_items WHERE inbound_id = ?', [req.params.id]);
        items.forEach(item => {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          const inventory = req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [order.warehouse_id, item.product_id, batch]);
          if (inventory && inventory.quantity > 0) {
            const newQty = Math.max(0, inventory.quantity - item.quantity);
            req.db.run('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newQty, inventory.id]);
          }
        });
      }
      // 清理关联的检验记录（防止外键约束失败）
      req.db.run('DELETE FROM inbound_inspections WHERE inbound_id = ?', [req.params.id]);
      req.db.run('DELETE FROM inbound_items WHERE inbound_id = ?', [req.params.id]);
      req.db.run('DELETE FROM inbound_orders WHERE id = ?', [req.params.id]);
    });
    writeLog(req.db, req.user?.id, '删除入库单', 'inbound', req.params.id, `入库单号: ${order?.order_no || req.params.id}，状态: ${order?.status}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 出库单 ====================
router.get('/outbound', requirePermission('warehouse_view'), (req, res) => {
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
    const result = req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/outbound/:id', validateId, requirePermission('warehouse_view'), (req, res) => {
  try {
    const order = req.db.get(`
      SELECT oo.*, w.name as warehouse_name
      FROM outbound_orders oo
      JOIN warehouses w ON oo.warehouse_id = w.id
      WHERE oo.id = ?
    `, [req.params.id]);
    const items = req.db.all(`
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

router.post('/outbound', requirePermission('warehouse_create'), validate(outboundCreate), (req, res) => {
  try {
    const { type, warehouse_id, order_id, items, operator, remark } = req.body;
    if (!warehouse_id) return res.status(400).json({ success: false, message: '请选择仓库' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: '请至少选择一个产品' });
    
    const prefix = type === 'raw' ? 'CK' : type === 'semi' ? 'SC' : 'CC';
    const orderNo = generateOrderNo(prefix);
    
    // 预取产品信息
    const productIds = [...new Set(items.map(i => i.product_id))];
    const productMap = new Map();
    productIds.forEach(id => {
      const p = req.db.get('SELECT unit, outer_diameter, wall_thickness, length FROM products WHERE id = ?', [id]);
      if (p) productMap.set(id, p);
    });
    
    let totalAmount = 0;
    items.forEach(item => {
      const product = productMap.get(item.product_id);
      const quantityKg = convertToKg(item.input_quantity || item.quantity, item.input_unit || '公斤', product);
      totalAmount += quantityKg * (item.unit_price || 0);
    });
    
    let outboundId;
    req.db.transaction(() => {
      const result = req.db.run(`
        INSERT INTO outbound_orders (order_no, type, warehouse_id, order_id, total_amount, operator, remark, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `, [orderNo, type, warehouse_id, order_id || null, totalAmount, operator, remark]);
      outboundId = result.lastInsertRowid;
      
      items.forEach(item => {
        const product = productMap.get(item.product_id);
        const inputUnit = product?.unit || '公斤';
        const inputQuantity = item.input_quantity || item.quantity;
        const quantityKg = convertToKg(inputQuantity, inputUnit, product);
        const batchNo = item.batch_no || 'DEFAULT_BATCH';
        req.db.run('INSERT INTO outbound_items (outbound_id, product_id, batch_no, quantity, input_quantity, input_unit, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [outboundId, item.product_id, batchNo, quantityKg, inputQuantity, inputUnit, item.unit_price || 0]);
      });
    });
    res.json({ success: true, data: { id: outboundId, order_no: orderNo } });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/outbound/:id/status', validateId, requirePermission('warehouse_edit'), (req, res) => {
  try {
    const { status } = req.body;
    // 【安全】状态值白名单校验
    const validStatuses = ['pending', 'approved', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    req.db.transaction(() => {
      const order = req.db.get('SELECT * FROM outbound_orders WHERE id = ?', [req.params.id]);
      // 【防重复】只有从非完成状态变为 completed/approved 时才扣减库存
      const alreadyDeducted = order && (order.status === 'completed' || order.status === 'approved');
      if ((status === 'completed' || status === 'approved') && !alreadyDeducted) {
        const items = req.db.all('SELECT * FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
        items.forEach(item => {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          const inv = req.db.get('SELECT quantity FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [order.warehouse_id, item.product_id, batch]);
          if (!inv || inv.quantity < item.quantity) {
            throw new Error(`批次条码 [${batch}] 对应的库存不足，无法出库`);
          }
          req.db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?',
            [item.quantity, order.warehouse_id, item.product_id, batch]);
        });
        
        // 【改进#6】成品出库完成后更新关联订单为已发货
        if (order.type === 'finished' && order.order_id) {
          req.db.run("UPDATE orders SET status = 'shipped', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'completed'", [order.order_id]);
        }
      }
      req.db.run('UPDATE outbound_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    if (error.message && error.message.includes('库存不足')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/outbound/:id', validateId, requirePermission('warehouse_edit'), (req, res) => {
  try {
    const { warehouse_id, order_id, operator, remark, items } = req.body;
    
    const productIds = [...new Set(items.map(i => i.product_id))];
    const productMap = new Map();
    productIds.forEach(id => {
      const p = req.db.get('SELECT unit, outer_diameter, wall_thickness, length FROM products WHERE id = ?', [id]);
      if (p) productMap.set(id, p);
    });
    
    req.db.transaction(() => {
      req.db.run('UPDATE outbound_orders SET warehouse_id = ?, order_id = ?, operator = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [warehouse_id, order_id || null, operator, remark, req.params.id]);
      req.db.run('DELETE FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
      items.forEach(item => {
        const product = productMap.get(item.product_id);
        const inputUnit = product?.unit || '公斤';
        const inputQuantity = item.input_quantity || item.quantity;
        const quantityKg = convertToKg(inputQuantity, inputUnit, product);
        const batchNo = item.batch_no || 'DEFAULT_BATCH';
        req.db.run('INSERT INTO outbound_items (outbound_id, product_id, batch_no, quantity, input_quantity, input_unit, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, batchNo, quantityKg, inputQuantity, inputUnit, item.unit_price || 0]);
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/outbound/:id', validateId, requirePermission('warehouse_delete'), (req, res) => {
  try {
    const { force } = req.query;
    const order = req.db.get('SELECT * FROM outbound_orders WHERE id = ?', [req.params.id]);
    const isAdmin = req.user?.role_code === 'admin';
    if (order && order.status === 'completed' && force !== 'true' && !isAdmin) {
      return res.status(400).json({ success: false, message: '已出库的单据不能删除，如需删除请联系管理员' });
    }
    
    req.db.transaction(() => {
      // 仅对已出库的单据回滚库存（出库=加回库存）
      if (order && (order.status === 'completed' || order.status === 'approved')) {
        const items = req.db.all('SELECT * FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
        items.forEach(item => {
          const batch = item.batch_no || 'DEFAULT_BATCH';
          const inventory = req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [order.warehouse_id, item.product_id, batch]);
          if (inventory) {
            req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, inventory.id]);
          } else {
            req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)', [order.warehouse_id, item.product_id, batch, item.quantity]);
          }
        });
      }
      req.db.run('DELETE FROM outbound_items WHERE outbound_id = ?', [req.params.id]);
      req.db.run('DELETE FROM outbound_orders WHERE id = ?', [req.params.id]);
    });
    writeLog(req.db, req.user?.id, '删除出库单', 'outbound', req.params.id, `出库单号: ${order?.order_no || req.params.id}，状态: ${order?.status}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[warehouse.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
