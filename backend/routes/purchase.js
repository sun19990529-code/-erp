const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validate } = require('../middleware/validate');
const { purchaseCreate } = require('../validators/schemas');
const { writeLog } = require('./logs');
const { generateOrderNo } = require('../utils/order-number');

// 采购单列表
router.get('/', requirePermission('purchase_view'), (req, res) => {
  try {
    const { status, supplier_id, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    if (supplier_id) { sql += ' AND po.supplier_id = ?'; params.push(supplier_id); }
    sql += ' ORDER BY po.created_at DESC';
    const result = req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error(`[purchase.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:id', requirePermission('purchase_view'), (req, res) => {
  try {
    const order = req.db.get(`
      SELECT po.*, s.name as supplier_name
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.id = ?
    `, [req.params.id]);
    const items = req.db.all(`
      SELECT pi.*, p.code, p.name, p.specification, p.unit
      FROM purchase_items pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.purchase_order_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error(`[purchase.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('purchase_create'), validate(purchaseCreate), (req, res) => {
  try {
    const { supplier_id, items, expected_date, operator, remark } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: '请至少选择一个产品' });
    const orderNo = generateOrderNo('PU');
    let totalAmount = 0;
    let purchaseId;
    items.forEach(item => { totalAmount += item.quantity * (item.unit_price || 0); });

    req.db.transaction(() => {
      const result = req.db.run(`INSERT INTO purchase_orders (order_no, supplier_id, total_amount, expected_date, operator, remark) VALUES (?, ?, ?, ?, ?, ?)`,
        [orderNo, supplier_id, totalAmount, expected_date, operator, remark]);
      purchaseId = result.lastInsertRowid;
      items.forEach(item => {
        req.db.run('INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [purchaseId, item.product_id, item.quantity, item.unit_price || 0]);
      });
    });
    writeLog(req.db, req.user?.id, '创建采购单', 'purchase', purchaseId, `采购单号: ${orderNo}`);
    res.json({ success: true, data: { id: purchaseId, order_no: orderNo } });
  } catch (error) {
    console.error(`[purchase.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/status', requirePermission('purchase_edit'), (req, res) => {
  try {
    const { status } = req.body;
    // 【安全】状态值白名单校验
    const validStatuses = ['pending', 'confirmed', 'completed', 'received', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `非法状态值: ${status}` });
    }
    
    req.db.transaction(() => {
      const purchase = req.db.get('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
      // 【防重复】只有从非完成状态变为 completed/received 时才创建入库单
      const alreadyProcessed = purchase && (purchase.status === 'completed' || purchase.status === 'received');
      if ((status === 'completed' || status === 'received') && !alreadyProcessed) {
        const items = req.db.all('SELECT * FROM purchase_items WHERE purchase_order_id = ?', [req.params.id]);
        if (items.length > 0) {
          const warehouse = req.db.get("SELECT id FROM warehouses WHERE type = 'raw' LIMIT 1");
          if (warehouse) {
            const inboundNo = generateOrderNo('IN');
            let totalAmount = 0;
            items.forEach(item => { totalAmount += (item.quantity || 0) * (item.unit_price || 0); });
            // 【联动#4】关联采购单ID，便于追溯
            const inboundResult = req.db.run(`INSERT INTO inbound_orders (order_no, type, warehouse_id, supplier_id, purchase_order_id, total_amount, operator, remark, status) VALUES (?, 'raw', ?, ?, ?, ?, ?, ?, 'pending_inspection')`,
              [inboundNo, warehouse.id, purchase.supplier_id, req.params.id, totalAmount, '采购入库', `采购单: ${purchase.order_no}`]);
            const inboundId = inboundResult.lastInsertRowid;
            items.forEach((item, index) => {
              const batchNo = `${inboundNo}-${index + 1}`;
              req.db.run('INSERT INTO inbound_items (inbound_id, product_id, batch_no, quantity, unit_price) VALUES (?, ?, ?, ?, ?)', [inboundId, item.product_id, batchNo, item.quantity, item.unit_price || 0]);
            });
          }
        }
      }
      req.db.run('UPDATE purchase_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[purchase.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', requirePermission('purchase_edit'), (req, res) => {
  try {
    const { supplier_id, expected_date, operator, remark, items } = req.body;
    req.db.transaction(() => {
      req.db.run('UPDATE purchase_orders SET supplier_id = ?, expected_date = ?, operator = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [supplier_id, expected_date, operator, remark, req.params.id]);
      req.db.run('DELETE FROM purchase_items WHERE purchase_order_id = ?', [req.params.id]);
      items.forEach(item => {
        req.db.run('INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_price, remark) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, item.product_id, item.quantity, item.unit_price || 0, item.remark]);
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[purchase.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', requirePermission('purchase_delete'), (req, res) => {
  try {
    const order = req.db.get('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
    if (order && order.status !== 'pending') return res.status(400).json({ success: false, message: '只能删除待处理状态的采购单' });
    req.db.transaction(() => {
      req.db.run('DELETE FROM purchase_items WHERE purchase_order_id = ?', [req.params.id]);
      req.db.run('DELETE FROM purchase_orders WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[purchase.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
