const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');

/**
 * 生产追踪 API
 * 聚合领料、产出、损耗数据，供前端看板使用
 */

// ==================== 工单维度追踪 ====================
router.get('/production/:id/tracking', requirePermission('production_view'), (req, res) => {
  try {
    const productionId = req.params.id;

    // 1. 工单基本信息
    const production = req.db.get(`
      SELECT po.*, p.code as product_code, p.name as product_name, p.specification, p.unit,
             o.order_no as sales_order_no, o.customer_name
      FROM production_orders po
      JOIN products p ON po.product_id = p.id
      LEFT JOIN orders o ON po.order_id = o.id
      WHERE po.id = ?
    `, [productionId]);
    if (!production) return res.status(404).json({ success: false, message: '工单不存在' });

    // 2. 所有关联领料单 + 明细
    const pickOrders = req.db.all(`
      SELECT pk.id, pk.order_no, pk.status, pk.operator, pk.created_at, w.name as warehouse_name
      FROM pick_orders pk
      LEFT JOIN warehouses w ON pk.warehouse_id = w.id
      WHERE pk.production_order_id = ?
      ORDER BY pk.created_at ASC
    `, [productionId]);

    let totalPicked = 0;
    // 批量查询所有领料单明细（避免 N+1）
    const pickOrderIds = pickOrders.map(pk => pk.id);
    const allPickItems = pickOrderIds.length > 0
      ? req.db.all(`SELECT pi.*, p.code, p.name, p.unit FROM pick_items pi JOIN products p ON pi.material_id = p.id WHERE pi.pick_order_id IN (${pickOrderIds.map(() => '?').join(',')})`, pickOrderIds)
      : [];
    const pickDetails = pickOrders.map(pk => {
      const items = allPickItems.filter(it => it.pick_order_id === pk.id);
      const orderTotal = items.reduce((sum, it) => sum + (it.quantity || 0), 0);
      if (pk.status === 'completed') totalPicked += orderTotal;
      return { ...pk, items, total_kg: orderTotal };
    });

    // 3. 按物料汇总已领量
    const materialSummary = req.db.all(`
      SELECT p.id, p.code, p.name, p.unit,
             SUM(CASE WHEN pk.status = 'completed' THEN pi.quantity ELSE 0 END) as picked_qty,
             COUNT(DISTINCT pk.id) as pick_count
      FROM pick_items pi
      JOIN pick_orders pk ON pi.pick_order_id = pk.id
      JOIN products p ON pi.material_id = p.id
      WHERE pk.production_order_id = ?
      GROUP BY p.id
    `, [productionId]);

    // 4. 成品产出（入库量）
    const outputRows = req.db.all(`
      SELECT ii.quantity, io.order_no as inbound_no, io.status, io.created_at
      FROM inbound_items ii
      JOIN inbound_orders io ON ii.inbound_id = io.id
      WHERE io.production_order_id = ? AND io.type = 'finished'
    `, [productionId]);
    const finishedOutput = outputRows
      .filter(r => r.status !== 'cancelled')
      .reduce((sum, r) => sum + (r.quantity || 0), 0);

    // 5. 半成品产出
    const semiOutput = req.db.all(`
      SELECT ii.quantity
      FROM inbound_items ii
      JOIN inbound_orders io ON ii.inbound_id = io.id
      WHERE io.production_order_id = ? AND io.type = 'semi'
    `, [productionId]).reduce((sum, r) => sum + (r.quantity || 0), 0);

    // 6. 工序进度
    const processRecords = req.db.all(`
      SELECT ppr.*, pr.name as process_name, pr.code as process_code
      FROM production_process_records ppr
      JOIN processes pr ON ppr.process_id = pr.id
      WHERE ppr.production_order_id = ?
      ORDER BY pr.sequence
    `, [productionId]);

    // 7. 损耗计算
    const totalOutput = finishedOutput + semiOutput;
    const lossQty = Math.max(0, totalPicked - totalOutput);
    const lossRate = totalPicked > 0 ? (lossQty / totalPicked * 100) : 0;

    res.json({
      success: true,
      data: {
        production,
        materials: {
          total_picked: totalPicked,
          summary: materialSummary,
          pick_orders: pickDetails
        },
        output: {
          finished_quantity: finishedOutput,
          semi_quantity: semiOutput,
          total: totalOutput,
          inbound_records: outputRows
        },
        process: processRecords,
        loss: {
          total_input: totalPicked,
          total_output: totalOutput,
          loss_quantity: parseFloat(lossQty.toFixed(4)),
          loss_rate: parseFloat(lossRate.toFixed(2))
        }
      }
    });
  } catch (error) {
    console.error('[tracking]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 订单维度追踪 ====================
router.get('/orders/:id/tracking', requirePermission('order_view'), (req, res) => {
  try {
    const orderId = req.params.id;

    // 1. 订单信息
    const order = req.db.get(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    const orderItems = req.db.all(`SELECT oi.*, p.code, p.name, p.unit FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [orderId]);

    // 2. 关联的所有生产工单
    const productions = req.db.all(`
      SELECT po.*, p.code as product_code, p.name as product_name, p.unit
      FROM production_orders po
      JOIN products p ON po.product_id = p.id
      WHERE po.order_id = ?
      ORDER BY po.created_at ASC
    `, [orderId]);

    let totalOrdered = orderItems.reduce((sum, it) => sum + (it.quantity || 0), 0);
    let totalProduced = 0;
    let totalPicked = 0;

    // 批量查询所有工单的领料量和产出量（避免 N+1）
    const poIds = productions.map(po => po.id);
    const allPickedByPo = poIds.length > 0
      ? req.db.all(`SELECT pk.production_order_id, COALESCE(SUM(pi.quantity), 0) as total FROM pick_items pi JOIN pick_orders pk ON pi.pick_order_id = pk.id WHERE pk.production_order_id IN (${poIds.map(() => '?').join(',')}) AND pk.status = 'completed' GROUP BY pk.production_order_id`, poIds)
      : [];
    const allOutputByPo = poIds.length > 0
      ? req.db.all(`SELECT io.production_order_id, COALESCE(SUM(ii.quantity), 0) as total FROM inbound_items ii JOIN inbound_orders io ON ii.inbound_id = io.id WHERE io.production_order_id IN (${poIds.map(() => '?').join(',')}) AND io.type = 'finished' AND io.status != 'cancelled' GROUP BY io.production_order_id`, poIds)
      : [];

    const productionDetails = productions.map(po => {
      const pickedTotal = allPickedByPo.find(r => r.production_order_id === po.id)?.total || 0;
      const outputTotal = allOutputByPo.find(r => r.production_order_id === po.id)?.total || 0;

      totalPicked += pickedTotal;
      totalProduced += outputTotal;

      const lossQty = Math.max(0, pickedTotal - outputTotal);
      const lossRate = pickedTotal > 0 ? (lossQty / pickedTotal * 100) : 0;

      return {
        ...po,
        picked_total: pickedTotal,
        output_total: outputTotal,
        loss_quantity: parseFloat(lossQty.toFixed(4)),
        loss_rate: parseFloat(lossRate.toFixed(2))
      };
    });

    // 3. 订单领料汇总（直接关联订单的领料单）
    const directPickOrders = req.db.all(`
      SELECT pk.id, pk.order_no, pk.status, pk.operator, pk.created_at, w.name as warehouse_name
      FROM pick_orders pk
      LEFT JOIN warehouses w ON pk.warehouse_id = w.id
      WHERE pk.order_id = ?
      ORDER BY pk.created_at ASC
    `, [orderId]);

    // 加上直接关联订单的领料量
    const directPicked = req.db.get(`
      SELECT COALESCE(SUM(pi.quantity), 0) as total
      FROM pick_items pi
      JOIN pick_orders pk ON pi.pick_order_id = pk.id
      WHERE pk.order_id = ? AND pk.production_order_id IS NULL AND pk.status = 'completed'
    `, [orderId]);
    totalPicked += (directPicked?.total || 0);

    // 4. 汇总
    const totalLoss = Math.max(0, totalPicked - totalProduced);
    const overallLossRate = totalPicked > 0 ? (totalLoss / totalPicked * 100) : 0;

    res.json({
      success: true,
      data: {
        order: { ...order, items: orderItems },
        production_orders: productionDetails,
        direct_pick_orders: directPickOrders,
        summary: {
          total_ordered: totalOrdered,
          total_produced: totalProduced,
          remaining: Math.max(0, totalOrdered - totalProduced),
          total_picked: totalPicked,
          total_loss: parseFloat(totalLoss.toFixed(4)),
          overall_loss_rate: parseFloat(overallLossRate.toFixed(2))
        }
      }
    });
  } catch (error) {
    console.error('[tracking]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
