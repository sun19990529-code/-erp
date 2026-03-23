const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { generateOrderNo } = require('../utils/order-number');
const { convertToKg } = require('../utils/unit-convert');

// 领料单列表
router.get('/', requirePermission('warehouse_view'), (req, res) => {
  try {
    const { status, order_id } = req.query;
    let sql = `
      SELECT po.*, w.name as warehouse_name,
        o.order_no, ppo.order_no as production_order_no
      FROM pick_orders po
      JOIN warehouses w ON po.warehouse_id = w.id
      LEFT JOIN orders o ON po.order_id = o.id
      LEFT JOIN production_orders ppo ON po.production_order_id = ppo.id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND po.status = ?'; params.push(status); }
    if (order_id) { sql += ' AND po.order_id = ?'; params.push(order_id); }
    sql += ' ORDER BY po.created_at DESC';
    const orders = req.db.all(sql, params);
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:id', requirePermission('warehouse_view'), (req, res) => {
  try {
    const order = req.db.get(`SELECT po.*, w.name as warehouse_name, o.order_no, ppo.order_no as production_order_no FROM pick_orders po JOIN warehouses w ON po.warehouse_id = w.id LEFT JOIN orders o ON po.order_id = o.id LEFT JOIN production_orders ppo ON po.production_order_id = ppo.id WHERE po.id = ?`, [req.params.id]);
    const items = req.db.all(`SELECT pi.*, p.code, p.name, p.unit FROM pick_items pi JOIN products p ON pi.material_id = p.id WHERE pi.pick_order_id = ?`, [req.params.id]);
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('warehouse_create'), (req, res) => {
  try {
    const { order_id, production_order_id, warehouse_id, operator, remark, items } = req.body;
    if (!warehouse_id) return res.status(400).json({ success: false, message: '请选择仓库' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: '请至少选择一个物料' });
    const orderNo = generateOrderNo('PK');
    let pickId;
    req.db.transaction(() => {
      const result = req.db.run(`INSERT INTO pick_orders (order_no, order_id, production_order_id, warehouse_id, operator, remark, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [orderNo, order_id || null, production_order_id || null, warehouse_id, operator, remark || null]);
      pickId = result.lastInsertRowid;
      (items || []).forEach(item => {
        if (item.material_id && item.quantity > 0) {
          const inputQuantity = item.input_quantity || item.quantity;
          const inputUnit = item.input_unit || '公斤';
          const quantityKg = convertToKg(inputQuantity, inputUnit);
          req.db.run(`INSERT INTO pick_items (pick_order_id, material_id, quantity, input_quantity, input_unit, remark) VALUES (?, ?, ?, ?, ?, ?)`,
            [pickId, item.material_id, quantityKg, inputQuantity, inputUnit, item.remark || null]);
        }
      });
    });
    res.json({ success: true, data: { id: pickId, order_no: orderNo } });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/status', requirePermission('warehouse_edit'), (req, res) => {
  try {
    const { status } = req.body;
    
    req.db.transaction(() => {
      if (status === 'completed') {
        const order = req.db.get('SELECT * FROM pick_orders WHERE id = ?', [req.params.id]);
        const items = req.db.all('SELECT pi.*, p.name as material_name FROM pick_items pi JOIN products p ON pi.material_id = p.id WHERE pi.pick_order_id = ?', [req.params.id]);
        items.forEach(item => {
          // 检查总库存是否充足
          const totalInv = req.db.get('SELECT SUM(quantity) as total FROM inventory WHERE warehouse_id = ? AND product_id = ?', [order.warehouse_id, item.material_id]);
          if (!totalInv || totalInv.total < item.quantity) {
            throw new Error(`物料「${item.material_name}」库存不足，需要 ${item.quantity}，当前库存 ${totalInv?.total || 0}`);
          }
          
          if (item.batch_no && item.batch_no !== 'DEFAULT_BATCH') {
            // 指定批次 → 精准扣减该批次
            const batchInv = req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND batch_no = ?', [order.warehouse_id, item.material_id, item.batch_no]);
            if (!batchInv || batchInv.quantity < item.quantity) {
              throw new Error(`物料「${item.material_name}」批次[${item.batch_no}]库存不足，需要 ${item.quantity}，该批次库存 ${batchInv?.quantity || 0}`);
            }
            req.db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [item.quantity, batchInv.id]);
          } else {
            // 未指定批次 → 按入库时间从早到晚 FIFO 逐批扣减
            let remaining = item.quantity;
            const batches = req.db.all('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ? AND quantity > 0 ORDER BY updated_at ASC', [order.warehouse_id, item.material_id]);
            for (const batch of batches) {
              if (remaining <= 0) break;
              const deduct = Math.min(remaining, batch.quantity);
              req.db.run('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [deduct, batch.id]);
              remaining -= deduct;
            }
          }
          
          if (order.order_id) {
            req.db.run('UPDATE order_materials SET picked_quantity = picked_quantity + ? WHERE order_id = ? AND material_id = ?',
              [item.quantity, order.order_id, item.material_id]);
          }
        });
        // 【联动#6】领料完成后检查生产工单原材料是否领齐
        if (order.production_order_id) {
          const production = req.db.get('SELECT * FROM production_orders WHERE id = ?', [order.production_order_id]);
          if (production && production.order_id) {
            const requiredMaterials = req.db.all('SELECT * FROM order_materials WHERE order_id = ?', [production.order_id]);
            const allPicked = requiredMaterials.length > 0 && requiredMaterials.every(m => (m.picked_quantity || 0) >= m.required_quantity);
            if (allPicked) {
              req.db.run("UPDATE production_orders SET material_ready = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [order.production_order_id]);
            }
          }
        }
      }
      req.db.run('UPDATE pick_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    if (error.message && error.message.includes('库存不足')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', requirePermission('warehouse_edit'), (req, res) => {
  try {
    const { order_id, production_order_id, warehouse_id, operator, remark, items } = req.body;
    req.db.transaction(() => {
      req.db.run('UPDATE pick_orders SET order_id = ?, production_order_id = ?, warehouse_id = ?, operator = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [order_id || null, production_order_id || null, warehouse_id, operator, remark, req.params.id]);
      req.db.run('DELETE FROM pick_items WHERE pick_order_id = ?', [req.params.id]);
      items.forEach(item => {
        const inputQuantity = item.input_quantity || item.quantity;
          const inputUnit = item.input_unit || '公斤';
          const quantityKg = convertToKg(inputQuantity, inputUnit);  // I6: 统一调用工具函数
        req.db.run('INSERT INTO pick_items (pick_order_id, material_id, quantity, input_quantity, input_unit) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, item.material_id, quantityKg, inputQuantity, inputUnit]);
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', requirePermission('warehouse_delete'), (req, res) => {
  try {
    const { force } = req.query;
    const order = req.db.get('SELECT * FROM pick_orders WHERE id = ?', [req.params.id]);
    const isAdmin = req.user?.role_code === 'admin';
    if (order && order.status === 'completed' && force !== 'true' && !isAdmin) {
      return res.status(400).json({ success: false, message: '已完成的领料单不能删除，如需删除请联系管理员' });
    }
    
    req.db.transaction(() => {
      // 仅对已完成领料的单据回滚库存（领料=加回库存）
      if (order && order.status === 'completed') {
        const items = req.db.all('SELECT * FROM pick_items WHERE pick_order_id = ?', [req.params.id]);
        items.forEach(item => {
          const inventory = req.db.get('SELECT * FROM inventory WHERE warehouse_id = ? AND product_id = ?', [order.warehouse_id, item.material_id]);
          if (inventory) {
            req.db.run('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE warehouse_id = ? AND product_id = ?',
              [item.quantity, order.warehouse_id, item.material_id]);
          } else {
            req.db.run('INSERT INTO inventory (warehouse_id, product_id, quantity) VALUES (?, ?, ?)',
              [order.warehouse_id, item.material_id, item.quantity]);
          }
        });
      }
      req.db.run('DELETE FROM pick_items WHERE pick_order_id = ?', [req.params.id]);
      req.db.run('DELETE FROM pick_orders WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[pick.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
