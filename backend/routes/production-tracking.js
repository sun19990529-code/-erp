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

// ==================== 批次维度溯源 ====================

/**
 * 批次号模糊搜索 — 返回匹配的批次号列表
 * GET /batch?keyword=xxx&limit=20
 */
router.get('/batch', requirePermission('warehouse_view'), (req, res) => {
  try {
    const { keyword, limit = 20 } = req.query;
    if (!keyword || keyword.trim().length < 1) {
      return res.json({ success: true, data: [] });
    }
    const like = `%${keyword.trim()}%`;
    const maxResults = Math.min(parseInt(limit) || 20, 100);

    // 从 4 张明细表中搜索不重复的 batch_no
    const batches = req.db.all(`
      SELECT DISTINCT batch_no, source, product_name, created_at FROM (
        SELECT ii.batch_no, '入库' as source, p.name as product_name, io.created_at
        FROM inbound_items ii
        JOIN inbound_orders io ON ii.inbound_id = io.id
        JOIN products p ON ii.product_id = p.id
        WHERE ii.batch_no LIKE ? AND ii.batch_no != 'DEFAULT_BATCH'
        UNION
        SELECT oi.batch_no, '出库' as source, p.name as product_name, ob.created_at
        FROM outbound_items oi
        JOIN outbound_orders ob ON oi.outbound_id = ob.id
        JOIN products p ON oi.product_id = p.id
        WHERE oi.batch_no LIKE ? AND oi.batch_no != 'DEFAULT_BATCH'
        UNION
        SELECT pi.batch_no, '领料' as source, p.name as product_name, pk.created_at
        FROM pick_items pi
        JOIN pick_orders pk ON pi.pick_order_id = pk.id
        JOIN products p ON pi.material_id = p.id
        WHERE pi.batch_no LIKE ? AND pi.batch_no != 'DEFAULT_BATCH'
        UNION
        SELECT inv.batch_no, '库存' as source, p.name as product_name, inv.updated_at as created_at
        FROM inventory inv
        JOIN products p ON inv.product_id = p.id
        WHERE inv.batch_no LIKE ? AND inv.batch_no != 'DEFAULT_BATCH'
      )
      ORDER BY created_at DESC
      LIMIT ?
    `, [like, like, like, like, maxResults]);

    // 去重（同一 batch_no 可能出现在多个表）
    const seen = new Set();
    const unique = batches.filter(b => {
      if (seen.has(b.batch_no)) return false;
      seen.add(b.batch_no);
      return true;
    });

    res.json({ success: true, data: unique });
  } catch (error) {
    console.error('[tracking/batch]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 批次全链路溯源 — 追踪一个批次号从入库到出库的完整生命周期
 * GET /batch/:batchNo
 */
router.get('/batch/:batchNo', requirePermission('warehouse_view'), (req, res) => {
  try {
    const batchNo = decodeURIComponent(req.params.batchNo);

    // 1. 入库记录
    const inboundRecords = req.db.all(`
      SELECT ii.id, ii.quantity, ii.unit_price, ii.batch_no,
             io.order_no, io.type, io.status, io.operator, io.created_at,
             p.code as product_code, p.name as product_name, p.unit, p.specification,
             s.name as supplier_name,
             w.name as warehouse_name
      FROM inbound_items ii
      JOIN inbound_orders io ON ii.inbound_id = io.id
      JOIN products p ON ii.product_id = p.id
      LEFT JOIN suppliers s ON io.supplier_id = s.id
      LEFT JOIN warehouses w ON io.warehouse_id = w.id
      WHERE ii.batch_no = ?
      ORDER BY io.created_at ASC
    `, [batchNo]);

    // 2. 当前库存
    const inventoryRecords = req.db.all(`
      SELECT inv.quantity, inv.batch_no, inv.updated_at,
             p.code as product_code, p.name as product_name, p.unit,
             w.name as warehouse_name, w.type as warehouse_type
      FROM inventory inv
      JOIN products p ON inv.product_id = p.id
      JOIN warehouses w ON inv.warehouse_id = w.id
      WHERE inv.batch_no = ?
    `, [batchNo]);

    // 3. 领料记录
    const pickRecords = req.db.all(`
      SELECT pi.quantity, pi.batch_no,
             pk.order_no, pk.status, pk.operator, pk.created_at,
             p.code as material_code, p.name as material_name, p.unit,
             po.order_no as production_order_no, po.id as production_order_id,
             pp.name as production_product_name,
             w.name as warehouse_name
      FROM pick_items pi
      JOIN pick_orders pk ON pi.pick_order_id = pk.id
      JOIN products p ON pi.material_id = p.id
      LEFT JOIN production_orders po ON pk.production_order_id = po.id
      LEFT JOIN products pp ON po.product_id = pp.id
      LEFT JOIN warehouses w ON pk.warehouse_id = w.id
      WHERE pi.batch_no = ?
      ORDER BY pk.created_at ASC
    `, [batchNo]);

    // 4. 出库记录
    const outboundRecords = req.db.all(`
      SELECT oi.quantity, oi.unit_price, oi.batch_no,
             ob.order_no, ob.type, ob.status, ob.operator, ob.created_at,
             p.code as product_code, p.name as product_name, p.unit,
             w.name as warehouse_name,
             ord.order_no as sales_order_no, ord.customer_name
      FROM outbound_items oi
      JOIN outbound_orders ob ON oi.outbound_id = ob.id
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN warehouses w ON ob.warehouse_id = w.id
      LEFT JOIN orders ord ON ob.order_id = ord.id
      WHERE oi.batch_no = ?
      ORDER BY ob.created_at ASC
    `, [batchNo]);

    // 5. 关联生产工单（通过领料关联）
    const productionIds = [...new Set(pickRecords.filter(r => r.production_order_id).map(r => r.production_order_id))];
    let productionRecords = [];
    if (productionIds.length > 0) {
      productionRecords = req.db.all(`
        SELECT po.id, po.order_no, po.status, po.quantity, po.completed_quantity,
               po.current_process, po.start_time, po.end_time, po.created_at,
               p.code as product_code, p.name as product_name, p.unit
        FROM production_orders po
        JOIN products p ON po.product_id = p.id
        WHERE po.id IN (${productionIds.map(() => '?').join(',')})
      `, productionIds);
    }

    // 6. 关联质检记录
    const inboundIds = inboundRecords.map(r => r.id);
    let inspectionRecords = [];
    if (inboundIds.length > 0) {
      // 从 inbound_items.id 回查 inbound_id
      const inboundOrderIds = [...new Set(req.db.all(`
        SELECT DISTINCT inbound_id FROM inbound_items WHERE batch_no = ?
      `, [batchNo]).map(r => r.inbound_id))];
      if (inboundOrderIds.length > 0) {
        inspectionRecords = req.db.all(`
          SELECT ii.inspection_no, ii.quantity, ii.pass_quantity, ii.fail_quantity,
                 ii.inspector, ii.result, ii.remark, ii.created_at,
                 p.name as product_name
          FROM inbound_inspections ii
          JOIN products p ON ii.product_id = p.id
          WHERE ii.inbound_id IN (${inboundOrderIds.map(() => '?').join(',')})
        `, inboundOrderIds);
      }
    }

    // 7. 构建时间线
    const timeline = [];
    inboundRecords.forEach(r => timeline.push({
      time: r.created_at, type: 'inbound', title: '入库',
      description: `${r.warehouse_name} · ${r.order_no}`,
      detail: `${r.product_name} ${r.quantity} ${r.unit || '件'}`,
      extra: r.supplier_name ? `供应商: ${r.supplier_name}` : null,
      status: r.status
    }));
    inspectionRecords.forEach(r => timeline.push({
      time: r.created_at, type: 'inspection', title: '质检',
      description: `${r.inspection_no}`,
      detail: `合格 ${r.pass_quantity} / 不合格 ${r.fail_quantity}`,
      extra: r.inspector ? `检验员: ${r.inspector}` : null,
      status: r.result === 'pass' ? 'approved' : (r.result === 'fail' ? 'rejected' : 'pending')
    }));
    pickRecords.forEach(r => timeline.push({
      time: r.created_at, type: 'pick', title: '领料',
      description: `${r.warehouse_name || ''} · ${r.order_no}`,
      detail: `${r.material_name} ${r.quantity} ${r.unit || '件'}`,
      extra: r.production_order_no ? `生产工单: ${r.production_order_no}` : null,
      status: r.status
    }));
    outboundRecords.forEach(r => timeline.push({
      time: r.created_at, type: 'outbound', title: '出库',
      description: `${r.warehouse_name || ''} · ${r.order_no}`,
      detail: `${r.product_name} ${r.quantity} ${r.unit || '件'}`,
      extra: r.customer_name ? `客户: ${r.customer_name}` : null,
      status: r.status
    }));
    // 按时间正序
    timeline.sort((a, b) => new Date(a.time) - new Date(b.time));

    // 8. 统计摘要
    const totalInbound = inboundRecords.reduce((s, r) => s + (r.quantity || 0), 0);
    const totalPicked = pickRecords.filter(r => r.status === 'completed').reduce((s, r) => s + (r.quantity || 0), 0);
    const totalOutbound = outboundRecords.filter(r => r.status === 'completed').reduce((s, r) => s + (r.quantity || 0), 0);
    const currentStock = inventoryRecords.reduce((s, r) => s + (r.quantity || 0), 0);

    // 产品信息（从入库记录取第一条）
    const product = inboundRecords[0] || outboundRecords[0] || pickRecords[0] || {};

    const hasData = inboundRecords.length > 0 || inventoryRecords.length > 0 || pickRecords.length > 0 || outboundRecords.length > 0;

    if (!hasData) {
      return res.json({ success: true, data: null, message: '未找到该批次号的相关记录' });
    }

    res.json({
      success: true,
      data: {
        batch_no: batchNo,
        product: {
          code: product.product_code || product.material_code,
          name: product.product_name || product.material_name,
          unit: product.unit,
          specification: product.specification
        },
        summary: {
          total_inbound: totalInbound,
          total_picked: totalPicked,
          total_outbound: totalOutbound,
          current_stock: currentStock
        },
        timeline,
        details: {
          inbound: inboundRecords,
          inventory: inventoryRecords,
          pick: pickRecords,
          outbound: outboundRecords,
          production: productionRecords,
          inspection: inspectionRecords
        }
      }
    });
  } catch (error) {
    console.error('[tracking/batch]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
