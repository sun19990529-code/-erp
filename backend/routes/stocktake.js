const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validateId } = require('../middleware/validate');
const { generateOrderNo } = require('../utils/order-number');

// 盘点单列表
router.get('/', requirePermission('warehouse_view'), async (req, res) => {
  try {
    const { status, warehouse_id, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT s.*, w.name as warehouse_name FROM stocktake_orders s JOIN warehouses w ON s.warehouse_id = w.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND s.status = ?'; params.push(status); }
    if (warehouse_id) { sql += ' AND s.warehouse_id = ?'; params.push(warehouse_id); }
    sql += ' ORDER BY s.created_at DESC';
    const result = await req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error('[stocktake.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 盘点单详情
router.get('/:id', validateId, requirePermission('warehouse_view'), async (req, res) => {
  try {
    const order = await req.db.get(`SELECT s.*, w.name as warehouse_name FROM stocktake_orders s JOIN warehouses w ON s.warehouse_id = w.id WHERE s.id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '盘点单不存在' });
    const items = await req.db.all(`SELECT si.*, p.code as product_code, p.name as product_name, p.unit, p.specification FROM stocktake_items si JOIN products p ON si.product_id = p.id WHERE si.stocktake_id = ?`, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error('[stocktake.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 创建盘点单（自动填入该仓库所有库存的系统数量）
router.post('/', requirePermission('warehouse_create'), async (req, res) => {
  try {
    const { warehouse_id, operator, remark } = req.body;
    if (!warehouse_id) return res.status(400).json({ success: false, message: '请选择仓库' });
    const orderNo = generateOrderNo('ST');
    let stocktakeId;
    await req.db.transaction(async () => {
      const result = await req.db.run(`INSERT INTO stocktake_orders (order_no, warehouse_id, operator, remark) VALUES (?, ?, ?, ?)`,
        [orderNo, warehouse_id, operator || null, remark || null]);
      stocktakeId = result.lastInsertRowid;
      // 自动拉取该仓库所有库存记录
      const inventoryItems = await req.db.all(`SELECT product_id, batch_no, SUM(quantity) as total FROM inventory WHERE warehouse_id = ? GROUP BY product_id, batch_no HAVING total > 0`, [warehouse_id]);
      for (const inv of inventoryItems) {
        await req.db.run(`INSERT INTO stocktake_items (stocktake_id, product_id, batch_no, system_quantity) VALUES (?, ?, ?, ?)`,
          [stocktakeId, inv.product_id, inv.batch_no, inv.total]);
      }
    });
    res.json({ success: true, data: { id: stocktakeId, order_no: orderNo } });
  } catch (error) {
    console.error('[stocktake.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 录入实际数量
router.put('/:id/items', validateId, requirePermission('warehouse_edit'), async (req, res) => {
  try {
    const { items } = req.body;
    const order = await req.db.get('SELECT * FROM stocktake_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '盘点单不存在' });
    if (order.status === 'confirmed') return res.status(400).json({ success: false, message: '已确认的盘点单不能修改' });
    await req.db.transaction(async () => {
      for (const item of (items || [])) {
        if (item.actual_quantity != null) {
          const actual = parseFloat(item.actual_quantity);
          const systemQty = parseFloat(item.system_quantity) || 0;
          const diff = actual - systemQty;
          
          if (item.is_new || !item.id) {
            await req.db.run('INSERT INTO stocktake_items (stocktake_id, product_id, batch_no, system_quantity, actual_quantity, difference, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [req.params.id, item.product_id, item.batch_no || '-', systemQty, actual, diff, item.remark || null]);
          } else {
            await req.db.run('UPDATE stocktake_items SET actual_quantity = ?, difference = ?, remark = ? WHERE id = ? AND stocktake_id = ?',
              [actual, diff, item.remark || null, item.id, req.params.id]);
          }
        }
      }
      await req.db.run("UPDATE stocktake_orders SET status = 'counting', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'draft'", [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[stocktake.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 确认盘点（按差异调整库存）
router.put('/:id/confirm', validateId, requirePermission('warehouse_edit'), async (req, res) => {
  try {
    const order = await req.db.get('SELECT * FROM stocktake_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '盘点单不存在' });
    if (order.status === 'confirmed') return res.status(400).json({ success: false, message: '盘点单已确认' });
    const items = await req.db.all('SELECT * FROM stocktake_items WHERE stocktake_id = ?', [req.params.id]);
    // 所有项必须录入实际数量
    const unfinished = items.filter(i => i.actual_quantity == null);
    if (unfinished.length > 0) return res.status(400).json({ success: false, message: `还有 ${unfinished.length} 项未录入实际数量` });
    
    await req.db.transaction(async () => {
      for (const item of items) {
        if (item.difference !== 0) {
          const inv = await req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?',
            [order.warehouse_id, item.product_id, item.batch_no]);
          if (inv) {
            // 直接设置为实际数量
            await req.db.run('UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.actual_quantity, inv.id]);
          } else if (item.actual_quantity > 0) {
            // 新增库存记录
            await req.db.run('INSERT INTO inventory (warehouse_id, product_id, batch_no, quantity) VALUES (?, ?, ?, ?)',
              [order.warehouse_id, item.product_id, item.batch_no, item.actual_quantity]);
          }
        }
      }
      await req.db.run("UPDATE stocktake_orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
    });
    res.json({ success: true, message: '盘点已确认，库存已调整' });
  } catch (error) {
    console.error('[stocktake.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除盘点单
router.delete('/:id', validateId, requirePermission('warehouse_delete'), async (req, res) => {
  try {
    const order = await req.db.get('SELECT * FROM stocktake_orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: '盘点单不存在' });
    if (order.status === 'confirmed') return res.status(400).json({ success: false, message: '已确认的盘点单不能删除' });
    await req.db.transaction(async () => {
      await req.db.run('DELETE FROM stocktake_items WHERE stocktake_id = ?', [req.params.id]);
      await req.db.run('DELETE FROM stocktake_orders WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[stocktake.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
