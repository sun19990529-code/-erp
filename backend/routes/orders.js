const express = require('express');
const router = express.Router();
const { generateOrderNo } = require('../utils/order-number');
const { requirePermission } = require('../middleware/permission');
const { validate, validateId } = require('../middleware/validate');
const { orderCreate } = require('../validators/schemas');
const { writeLog } = require('./logs');
const { BusinessError } = require('../utils/BusinessError');

// ==================== 订单管理 ====================
router.get('/', requirePermission('order_view'), async (req, res) => {
  try {
    const { status, keyword, page = 1, pageSize = 20 } = req.query;
    const safePage = Math.max(1, parseInt(page) || 1);
    const safePageSize = Math.min(Math.max(1, parseInt(pageSize) || 20), 100);
    let sql = `
      SELECT o.*, c.name as customer_name_real
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      const statuses = status.split(',');
      if (statuses.length > 1) {
        sql += ` AND o.status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      } else {
        sql += ' AND o.status = ?';
        params.push(status);
      }
    }
    if (keyword) { sql += ' AND (o.order_no LIKE ? OR o.customer_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    sql += ' ORDER BY o.created_at DESC';
    const result = await req.db.paginate(sql, params, safePage, safePageSize);
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[orders.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:id', validateId, requirePermission('order_view'), async (req, res) => {
  try {
    const order = await req.db.get(`
      SELECT o.*, c.name as customer_name_real, c.contact_person, c.phone as customer_phone_real, c.address as customer_address_real
      FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = ?
    `, [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });

    const [items, productionOrders, outboundOrders] = await Promise.all([
      req.db.all(`SELECT oi.*, p.code, p.name, p.specification, p.unit FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [req.params.id]),
      req.db.all(`SELECT po.*, p.name as product_name FROM production_orders po LEFT JOIN products p ON po.product_id = p.id WHERE po.order_id = ? ORDER BY po.created_at DESC`, [req.params.id]),
      req.db.all(`SELECT oo.*, w.name as warehouse_name FROM outbound_orders oo LEFT JOIN warehouses w ON oo.warehouse_id = w.id WHERE oo.order_id = ? ORDER BY oo.created_at DESC`, [req.params.id])
    ]);
    res.json({ success: true, data: { ...order, items, productionOrders, outboundOrders } });
  } catch (error) {
    console.error(`[orders.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('order_create'), validate(orderCreate), async (req, res) => {
  try {
    const { customer_id, customer_name, customer_phone, customer_address, items, delivery_date, priority, remark } = req.body;
    const orderNo = generateOrderNo('SO');
    let orderId;
    let totalAmount = 0;
    items.forEach(item => { totalAmount += item.quantity * (item.unit_price || 0); });
    
    await req.db.transaction(async () => {
      const result = await req.db.run(`
        INSERT INTO orders (order_no, customer_id, customer_name, customer_phone, customer_address, total_amount, priority, delivery_date, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [orderNo, customer_id, customer_name, customer_phone, customer_address, totalAmount, priority, delivery_date, remark]);
      orderId = result.lastInsertRowid;
      for (const item of items) {
        await req.db.run('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [orderId, item.product_id, item.quantity, item.unit_price || 0]);
      }
    });
    writeLog(req.db, req.user?.id, '创建订单', 'orders', orderId, `订单号: ${orderNo}`);
    res.json({ success: true, data: { id: orderId, order_no: orderNo } });
  } catch (error) {
    console.error(`[orders.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/status', validateId, requirePermission('order_edit'), async (req, res) => {
  try {
    const { status } = req.body;
    // 【安全】状态值白名单校验（completed 和 shipped 由系统自动管理，不允许手动设置）
    const validStatuses = ['pending', 'confirmed', 'processing', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}。订单完成和发货由系统自动管理。` });
    }
    const orderId = req.params.id;
    
    await req.db.transaction(async () => {
      if (status === 'processing') {
        const order = await req.db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (order && (order.status === 'pending' || order.status === 'confirmed')) {
          const items = await req.db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
          for (const item of items) {
            const existing = await req.db.get('SELECT id FROM production_orders WHERE order_id = ? AND product_id = ?', [orderId, item.product_id]);
            if (existing) continue;
            const poNo = generateOrderNo('PO');
            const result = await req.db.run(`INSERT INTO production_orders (order_no, order_id, product_id, quantity, remark, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
              [poNo, orderId, item.product_id, item.quantity, '订单自动生成']);
            const productionId = result.lastInsertRowid;
            const productProcesses = await req.db.all(`SELECT pp.*, p.code as process_code FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [item.product_id]);
            if (productProcesses.length > 0) {
              for (const pp of productProcesses) { 
                await req.db.run(`INSERT INTO production_process_records (production_order_id, process_id, status) VALUES (?, ?, 'pending')`, [productionId, pp.process_id]); 
              }
              await req.db.run('UPDATE production_orders SET current_process = ? WHERE id = ?', [productProcesses[0].process_code, productionId]);
            }
          }
        }
      }
      await req.db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, orderId]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[orders.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', validateId, requirePermission('order_edit'), async (req, res) => {
  try {
    const { customer_id, customer_name, customer_phone, customer_address, delivery_date, priority, remark, items } = req.body;
    // 【B5】只允许 pending/confirmed 状态的订单修改
    const order = await req.db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: '只能修改待处理或已确认的订单' });
    }
    let totalAmount = 0;
    items.forEach(item => { totalAmount += item.quantity * (item.unit_price || 0); });
    
    await req.db.transaction(async () => {
      await req.db.run(`UPDATE orders SET customer_id = ?, customer_name = ?, customer_phone = ?, customer_address = ?, total_amount = ?, priority = ?, delivery_date = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [customer_id || null, customer_name, customer_phone, customer_address, totalAmount, priority, delivery_date, remark, req.params.id]);
      await req.db.run('DELETE FROM order_items WHERE order_id = ?', [req.params.id]);
      for (const item of items) {
        await req.db.run('INSERT INTO order_items (order_id, product_id, quantity, unit_price, remark) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, item.quantity, item.unit_price || 0, item.remark]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[orders.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', validateId, requirePermission('order_delete'), async (req, res) => {
  try {
    const { force } = req.query;
    const isAdmin = req.user?.role_code === 'admin';
    const order = await req.db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    
    // 【安全】强制删除仅限管理员
    if (force === 'true' && !isAdmin) {
      return res.status(403).json({ success: false, message: '仅管理员可执行强制删除操作' });
    }
    
    if (order && order.status !== 'pending' && force !== 'true') {
      return res.status(400).json({ success: false, message: '只能删除待处理状态的订单，管理员可强制删除' });
    }
    await req.db.transaction(async () => {
      if (isAdmin && force === 'true') {
        // 聚合所有需要回退的库存变动： key: "warehouse_id|product_id|batch_no", value: quantity_delta
        const inventoryDeltas = {};
        const addDelta = (wh, p, batch, qty) => {
          const key = `${wh}|${p}|${batch || 'DEFAULT_BATCH'}`;
          inventoryDeltas[key] = (inventoryDeltas[key] || 0) + qty;
        };

        // 1. 回滚由销售出库引起的库存变化 (出库回滚 -> 加回库存)
        const outbounds = await req.db.all("SELECT oo.warehouse_id, oi.product_id, oi.batch_no, oi.quantity FROM outbound_orders oo JOIN outbound_items oi ON oo.id = oi.outbound_id WHERE oo.order_id = ? AND oo.status = 'completed'", [req.params.id]);
        for (const item of outbounds) addDelta(item.warehouse_id, item.product_id, item.batch_no, item.quantity);
        
        await req.db.run('DELETE FROM outbound_items WHERE outbound_id IN (SELECT id FROM outbound_orders WHERE order_id = ?)', [req.params.id]);
        await req.db.run('DELETE FROM outbound_orders WHERE order_id = ?', [req.params.id]);

        // 2. 回滚领料单引起的库存变化 (领料回滚 -> 加回，退料回滚 -> 扣减)
        const picks = await req.db.all("SELECT pk.type, pk.warehouse_id, pi.material_id, pi.batch_no, pi.quantity FROM pick_orders pk JOIN pick_items pi ON pk.id = pi.pick_order_id WHERE pk.order_id = ? AND pk.status = 'completed'", [req.params.id]);
        for (const item of picks) {
          if (item.type === 'pick') addDelta(item.warehouse_id, item.material_id, item.batch_no, item.quantity);
          else addDelta(item.warehouse_id, item.material_id, item.batch_no, -item.quantity);
        }
        
        // 清理所有关联领料单
        const allPicks = await req.db.all('SELECT id FROM pick_orders WHERE order_id = ?', [req.params.id]);
        for (const pk of allPicks) {
          await req.db.run('DELETE FROM pick_items WHERE pick_order_id = ?', [pk.id]);
          await req.db.run('DELETE FROM pick_orders WHERE id = ?', [pk.id]);
        }

        // 管理员强制删除：清理生产及相关衍生单据
        const allProductions = await req.db.all('SELECT id, order_no FROM production_orders WHERE order_id = ?', [req.params.id]);
        
        // 收集所有的待处理消耗，对于消耗没有 warehouse_id，先收集起来批量查 fallback
        const pendingConsumes = [];
        
        for (const po of allProductions) {
          // 回退生产完工入库的库存 (入库回滚 -> 扣减)
          const inbounds = await req.db.all("SELECT io.warehouse_id, ii.product_id, ii.batch_no, ii.quantity FROM inbound_orders io JOIN inbound_items ii ON io.id = ii.inbound_id WHERE io.production_order_id = ? AND io.status = 'completed'", [po.id]);
          for (const item of inbounds) addDelta(item.warehouse_id, item.product_id, item.batch_no, -item.quantity);

          await req.db.run('DELETE FROM inbound_items WHERE inbound_id IN (SELECT id FROM inbound_orders WHERE production_order_id = ?)', [po.id]);
          await req.db.run('DELETE FROM inbound_orders WHERE production_order_id = ?', [po.id]);

          // 回退报工阶段自动扣除的原材料 (需要去向确认)
          const consumes = await req.db.all("SELECT * FROM production_material_consumption WHERE production_order_id = ?", [po.id]);
          pendingConsumes.push(...consumes);

          // 回退工序直出的半成品/成品（批次号自动标记为 PRD-单号 的库存）
          await req.db.run("DELETE FROM inventory WHERE batch_no = ?", [`PRD-${po.order_no}`]);

          // 常规外键表清理
          await req.db.run('DELETE FROM production_material_consumption WHERE production_order_id = ?', [po.id]);
          await req.db.run('DELETE FROM patrol_inspections WHERE production_order_id = ?', [po.id]);
          await req.db.run('DELETE FROM final_inspections WHERE production_order_id = ?', [po.id]);
          await req.db.run('DELETE FROM production_process_records WHERE production_order_id = ?', [po.id]);

          
          // 清理关联的委外单
          const outsourcings = await req.db.all('SELECT id FROM outsourcing_orders WHERE production_order_id = ?', [po.id]);
          for (const oo of outsourcings) {
            await req.db.run('DELETE FROM outsourcing_inspections WHERE outsourcing_id = ?', [oo.id]);
            await req.db.run('DELETE FROM outsourcing_items WHERE outsourcing_order_id = ?', [oo.id]);
          }
          await req.db.run('DELETE FROM outsourcing_orders WHERE production_order_id = ?', [po.id]);
          await req.db.run('DELETE FROM production_orders WHERE id = ?', [po.id]);
        }
        
        // 统一处理缺失 warehouse_id 的消耗回滚
        if (pendingConsumes.length > 0) {
          const matIds = [...new Set(pendingConsumes.map(c => c.material_id))];
          const matPh = matIds.map(() => '?').join(',');
          const inventoryRows = await req.db.all(`SELECT id, warehouse_id, product_id, batch_no FROM inventory WHERE product_id IN (${matPh})`, matIds);
          
          for (const c of pendingConsumes) {
            const batchNo = c.batch_no || 'DEFAULT_BATCH';
            let targetInv = inventoryRows.find(r => r.product_id === c.material_id && r.batch_no === batchNo);
            if (!targetInv) targetInv = inventoryRows.find(r => r.product_id === c.material_id);
            if (targetInv) {
              addDelta(targetInv.warehouse_id, targetInv.product_id, targetInv.batch_no, c.actual_quantity);
            }
          }
        }
        
        // 最后一次性下发库存变动（消除 N+1）
        for (const [key, delta] of Object.entries(inventoryDeltas)) {
          if (delta === 0) continue;
          const [wh, prod, batch] = key.split('|');
          if (delta > 0) {
            await req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [delta, wh, prod, batch]);
          } else {
            await req.db.run('UPDATE inventory SET quantity = MAX(0, quantity - ?), updated_at = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [Math.abs(delta), wh, prod, batch]);
          }
        }
        
      } else {
        // 普通用户：只清理 pending 状态的
        const relatedProductions = await req.db.all("SELECT id FROM production_orders WHERE order_id = ? AND status = 'pending'", [req.params.id]);
        for (const po of relatedProductions) {
          await req.db.run('DELETE FROM production_material_consumption WHERE production_order_id = ?', [po.id]);
          await req.db.run('DELETE FROM production_process_records WHERE production_order_id = ?', [po.id]);
          await req.db.run('DELETE FROM production_orders WHERE id = ?', [po.id]);
        }
        const activeProductions = await req.db.get("SELECT COUNT(*) as count FROM production_orders WHERE order_id = ? AND status != 'pending'", [req.params.id]);
        if (activeProductions && activeProductions.count > 0) {
          throw new BusinessError('该订单有进行中的生产工单，无法删除');
        }
        const relatedPicks = await req.db.all("SELECT id FROM pick_orders WHERE order_id = ? AND status = 'pending'", [req.params.id]);
        for (const pk of relatedPicks) {
          await req.db.run('DELETE FROM pick_items WHERE pick_order_id = ?', [pk.id]);
          await req.db.run('DELETE FROM pick_orders WHERE id = ?', [pk.id]);
        }
      }
      await req.db.run('DELETE FROM order_items WHERE order_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM order_materials WHERE order_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM orders WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[orders.js]`, error.message);
    if (error instanceof BusinessError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 订单原材料需求
router.get('/:id/materials', validateId, requirePermission('order_view'), async (req, res) => {
  try {
    const materials = await req.db.all(`SELECT om.*, p.code, p.name, p.unit, p.specification FROM order_materials om JOIN products p ON om.material_id = p.id WHERE om.order_id = ?`, [req.params.id]);
    res.json({ success: true, data: materials });
  } catch (error) {
    console.error(`[orders.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/:id/materials', validateId, requirePermission('order_edit'), async (req, res) => {
  try {
    const { materials } = req.body;
    await req.db.transaction(async () => {
      await req.db.run('DELETE FROM order_materials WHERE order_id = ?', [req.params.id]);
      for (const m of (materials || [])) {
        if (m.material_id && m.required_quantity > 0) {
          await req.db.run(`INSERT INTO order_materials (order_id, product_id, material_id, required_quantity, remark) VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, m.product_id, m.material_id, m.required_quantity, m.remark || null]);
        }
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[orders.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
