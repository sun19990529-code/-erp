const express = require('express');
const router = express.Router();
const { generateOrderNo } = require('../utils/order-number');
const { requirePermission } = require('../middleware/permission');
const { validate, validateId } = require('../middleware/validate');
const { orderCreate } = require('../validators/schemas');
const { writeLog } = require('./logs');
const { createReceivable } = require('./finance');

// ==================== 订单管理 ====================
router.get('/', requirePermission('order_view'), async (req, res) => {
  try {
    const { status, keyword, page = 1, pageSize = 20 } = req.query;
    let sql = `
      SELECT o.*, c.name as customer_name_real
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND o.status = ?'; params.push(status); }
    if (keyword) { sql += ' AND (o.order_no LIKE ? OR o.customer_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    sql += ' ORDER BY o.created_at DESC';
    const result = await req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
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
    const items = await req.db.all(`SELECT oi.*, p.code, p.name, p.specification, p.unit FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [req.params.id]);
    const productionOrders = await req.db.all(`SELECT po.*, p.name as product_name FROM production_orders po LEFT JOIN products p ON po.product_id = p.id WHERE po.order_id = ? ORDER BY po.created_at DESC`, [req.params.id]);
    const outboundOrders = await req.db.all(`SELECT oo.*, w.name as warehouse_name FROM outbound_orders oo LEFT JOIN warehouses w ON oo.warehouse_id = w.id WHERE oo.order_id = ? ORDER BY oo.created_at DESC`, [req.params.id]);
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
    // 【安全】状态值白名单校验
    const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    const orderId = req.params.id;
    
    await req.db.transaction(async () => {
      if (status === 'processing') {
        const order = await req.db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (order && (order.status === 'pending' || order.status === 'confirmed')) {
          const items = await req.db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
          for (const item of items) {
            const existing = await req.db.get('SELECT id FROM production_orders WHERE order_id = ? AND product_id = ?', [orderId, item.product_id]);
            if (existing) return;
            const poNo = generateOrderNo('PO');
            const result = await req.db.run(`INSERT INTO production_orders (order_no, order_id, product_id, quantity, remark, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
              [poNo, orderId, item.product_id, item.quantity, '订单自动生成']);
            const productionId = result.lastInsertRowid;
            const productProcesses = await req.db.all(`SELECT pp.*, p.code as process_code FROM product_processes pp JOIN processes p ON pp.process_id = p.id WHERE pp.product_id = ? ORDER BY pp.sequence`, [item.product_id]);
            if (productProcesses.length > 0) {
              await req.db.run('UPDATE production_orders SET current_process = ? WHERE id = ?', [productProcesses[0].process_code, productionId]);
            }
          }
        }
      }
      await req.db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, orderId]);
      
      // 【财务联动】订单发货时自动生成应收账款
      if (status === 'shipped') {
        const order = await req.db.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (order && order.total_amount > 0) {
          await createReceivable(req.db, {
            type: '销售应收',
            sourceType: 'order',
            sourceId: orderId,
            customerId: order.customer_id,
            amount: order.total_amount,
            remark: `订单 ${order.order_no} 发货自动生成`
          });
        }
      }
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
    if (order && order.status !== 'pending' && force !== 'true' && !isAdmin) {
      return res.status(400).json({ success: false, message: '只能删除待处理状态的订单，如需删除请联系管理员' });
    }
    await req.db.transaction(async () => {
      if (isAdmin || force === 'true') {
        // 管理员强制删除：清理所有状态的关联数据
        const allProductions = await req.db.all('SELECT id FROM production_orders WHERE order_id = ?', [req.params.id]);
        for (const po of allProductions) {
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
        // 清理所有关联领料单
        const allPicks = await req.db.all('SELECT id FROM pick_orders WHERE order_id = ?', [req.params.id]);
        for (const pk of allPicks) {
          await req.db.run('DELETE FROM pick_items WHERE pick_order_id = ?', [pk.id]);
          await req.db.run('DELETE FROM pick_orders WHERE id = ?', [pk.id]);
        }
      } else {
        // 普通用户：只清理 pending 状态的
        const relatedProductions = await req.db.all("SELECT id FROM production_orders WHERE order_id = ? AND status = 'pending'", [req.params.id]);
        for (const po of relatedProductions) {
          await req.db.run('DELETE FROM production_process_records WHERE production_order_id = ?', [po.id]);
          await req.db.run('DELETE FROM production_orders WHERE id = ?', [po.id]);
        }
        const activeProductions = await req.db.get("SELECT COUNT(*) as count FROM production_orders WHERE order_id = ? AND status != 'pending'", [req.params.id]);
        if (activeProductions && activeProductions.count > 0) {
          throw new Error('该订单有进行中的生产工单，无法删除');
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
    if (error.message && error.message.includes('生产工单')) {
      return res.status(400).json({ success: false, message: error.message });
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
