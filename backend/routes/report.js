const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { sendNotification } = require('./notifications');

/**
 * 生产日报 — 按日期区间汇总产量、不良率、物料消耗
 * GET /daily?start=2026-03-01&end=2026-03-31
 */
router.get('/daily', requirePermission('production_view'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const endDate = end || new Date().toISOString().slice(0, 10);

    // 按日期汇总所有报工记录
    const dailyData = await req.db.all(`
      SELECT DATE(ppr.created_at) as date,
        COUNT(DISTINCT ppr.production_order_id) as order_count,
        COALESCE(SUM(ppr.output_quantity), 0) as total_output,
        COALESCE(SUM(ppr.defect_quantity), 0) as total_defect,
        COUNT(*) as record_count
      FROM production_process_records ppr
      WHERE DATE(ppr.created_at) BETWEEN ? AND ?
      GROUP BY DATE(ppr.created_at)
      ORDER BY date DESC
    `, [startDate, endDate]);

    // 各日加上不良率
    const enriched = dailyData.map(d => ({
      ...d,
      defect_rate: d.total_output > 0 ? parseFloat(((d.total_defect / d.total_output) * 100).toFixed(2)) : 0,
      good_output: d.total_output - d.total_defect
    }));

    // 汇总
    const totalOutput = enriched.reduce((s, d) => s + d.total_output, 0);
    const totalDefect = enriched.reduce((s, d) => s + d.total_defect, 0);

    res.json({
      success: true,
      data: enriched,
      summary: {
        days: enriched.length,
        total_output: totalOutput,
        total_defect: totalDefect,
        total_good: totalOutput - totalDefect,
        avg_defect_rate: totalOutput > 0 ? parseFloat(((totalDefect / totalOutput) * 100).toFixed(2)) : 0,
        avg_daily_output: enriched.length > 0 ? parseFloat((totalOutput / enriched.length).toFixed(1)) : 0
      }
    });
  } catch (error) {
    console.error('[report/daily]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 按产品维度汇总
 * GET /by-product?start=2026-03-01&end=2026-03-31
 */
router.get('/by-product', requirePermission('production_view'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = end || new Date().toISOString().slice(0, 10);

    const data = await req.db.all(`
      SELECT p.id, p.code, p.name, p.specification, p.unit,
        COUNT(DISTINCT po.id) as order_count,
        COALESCE(SUM(po.quantity), 0) as planned_qty,
        COALESCE(SUM(po.completed_quantity), 0) as completed_qty,
        COALESCE(SUM(ppr_agg.total_output), 0) as total_output,
        COALESCE(SUM(ppr_agg.total_defect), 0) as total_defect
      FROM production_orders po
      JOIN products p ON po.product_id = p.id
      LEFT JOIN (
        SELECT production_order_id,
          SUM(output_quantity) as total_output,
          SUM(defect_quantity) as total_defect
        FROM production_process_records
        GROUP BY production_order_id
      ) ppr_agg ON ppr_agg.production_order_id = po.id
      WHERE DATE(po.created_at) BETWEEN ? AND ?
      GROUP BY p.id
      ORDER BY completed_qty DESC
    `, [startDate, endDate]);

    const enriched = data.map(d => ({
      ...d,
      completion_rate: d.planned_qty > 0 ? parseFloat(((d.completed_qty / d.planned_qty) * 100).toFixed(1)) : 0,
      defect_rate: d.total_output > 0 ? parseFloat(((d.total_defect / d.total_output) * 100).toFixed(2)) : 0
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[report/by-product]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 物料消耗汇总
 * GET /material-consumption?start=2026-03-01&end=2026-03-31
 */
router.get('/material-consumption', requirePermission('production_view'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = end || new Date().toISOString().slice(0, 10);

    const data = await req.db.all(`
      SELECT p.id, p.code, p.name, p.unit,
        COALESCE(SUM(pmc.planned_quantity), 0) as total_planned,
        COALESCE(SUM(pmc.actual_quantity), 0) as total_actual,
        COUNT(*) as usage_count
      FROM production_material_consumption pmc
      JOIN products p ON pmc.material_id = p.id
      WHERE DATE(pmc.created_at) BETWEEN ? AND ?
      GROUP BY p.id
      ORDER BY total_actual DESC
    `, [startDate, endDate]);

    const enriched = data.map(d => ({
      ...d,
      waste_rate: d.total_planned > 0 ? parseFloat((((d.total_actual - d.total_planned) / d.total_planned) * 100).toFixed(2)) : 0
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[report/material]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 财务流水走势 — 按日聚合应收、应付发生额及实收实付额
 * GET /finance-trend?start=2026-03-01&end=2026-03-31
 */
router.get('/finance-trend', requirePermission('dashboard_view'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = end || new Date().toISOString().slice(0, 10);
    const startTs = startDate + ' 00:00:00';
    const endTs = endDate + ' 23:59:59';

    // 生成基础日期序列（使用本地时区构造避免 UTC 偏移）
    const dates = [];
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    let curr = new Date(sy, sm - 1, sd);
    const endObj = new Date(ey, em - 1, ed);
    while (curr <= endObj) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }

    // 取应收（营业额产生）— 范围查询可利用索引
    const recData = await req.db.all(`
      SELECT DATE(created_at) as date, COALESCE(SUM(amount), 0) as amount 
      FROM receivables WHERE created_at >= ? AND created_at <= ? GROUP BY DATE(created_at)
    `, [startTs, endTs]);

    // 取应付（支出产生）
    const payData = await req.db.all(`
      SELECT DATE(created_at) as date, COALESCE(SUM(amount), 0) as amount 
      FROM payables WHERE created_at >= ? AND created_at <= ? GROUP BY DATE(created_at)
    `, [startTs, endTs]);

    // 用 Map 提升 O(1) 查找性能
    const recMap = new Map(recData.map(x => [x.date, x.amount]));
    const payMap = new Map(payData.map(x => [x.date, x.amount]));

    const combined = dates.map(d => ({
      date: d,
      receivable: recMap.get(d) || 0,
      payable: payMap.get(d) || 0
    }));

    res.json({ success: true, data: combined });
  } catch (error) {
    console.error('[report/finance-trend]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 库管出入流水趋势
 * GET /inventory-trend?start=2026-03-01&end=2026-03-31
 */
router.get('/inventory-trend', requirePermission('dashboard_view'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = end || new Date().toISOString().slice(0, 10);
    const startTs = startDate + ' 00:00:00';
    const endTs = endDate + ' 23:59:59';

    // 必须 JOIN 子表 inbound_items 才能拿到 quantity（主表无此字段）
    const inboundData = await req.db.all(`
      SELECT DATE(io.created_at) as date, COALESCE(SUM(ii.quantity), 0) as quantity
      FROM inbound_orders io
      JOIN inbound_items ii ON ii.inbound_id = io.id
      WHERE io.status IN ('completed', 'approved')
        AND io.created_at >= ? AND io.created_at <= ?
      GROUP BY DATE(io.created_at)
    `, [startTs, endTs]);

    // 同理 JOIN outbound_items
    const outboundData = await req.db.all(`
      SELECT DATE(oo.created_at) as date, COALESCE(SUM(oi.quantity), 0) as quantity
      FROM outbound_orders oo
      JOIN outbound_items oi ON oi.outbound_id = oo.id
      WHERE oo.status IN ('completed', 'approved')
        AND oo.created_at >= ? AND oo.created_at <= ?
      GROUP BY DATE(oo.created_at)
    `, [startTs, endTs]);

    // 生成连续日期序列（纯字符串运算避免时区问题）
    const dates = [];
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    let cur = new Date(sy, sm - 1, sd);
    const endObj = new Date(ey, em - 1, ed);
    while (cur <= endObj) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }

    // 用 Map 提升查找性能（O(1) 替代 Array.find 的 O(n)）
    const inMap = new Map(inboundData.map(x => [x.date, x.quantity]));
    const outMap = new Map(outboundData.map(x => [x.date, x.quantity]));

    const combined = dates.map(d => ({
      date: d,
      inbound: inMap.get(d) || 0,
      outbound: outMap.get(d) || 0
    }));

    res.json({ success: true, data: combined });
  } catch (error) {
    console.error('[report/inventory-trend]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 超期检查 — 检查订单、采购单、委外单是否超期，自动发送通知
 * GET /check-overdue
 */
router.get('/check-overdue', requirePermission('production_view'), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    let notifications = 0;

    // 1. 订单超期：未完成且 delivery_date < 今天
    const overdueOrders = await req.db.all(
      `SELECT id, order_no, delivery_date FROM orders WHERE status NOT IN ('completed', 'cancelled') AND delivery_date < ? AND delivery_date IS NOT NULL`,
      [today]
    );
    overdueOrders.forEach(o => {
      sendNotification(req.db, null, 'warning', '订单交期超期',
        `订单 ${o.order_no} 交期 ${o.delivery_date} 已超期，请尽快处理`, 'order', o.id);
      notifications++;
    });

    // 2. 采购超期
    const overduePurchases = await req.db.all(
      `SELECT id, order_no, expected_date FROM purchase_orders WHERE status NOT IN ('completed', 'received', 'cancelled') AND expected_date < ? AND expected_date IS NOT NULL`,
      [today]
    );
    overduePurchases.forEach(p => {
      sendNotification(req.db, null, 'warning', '采购单超期',
        `采购单 ${p.order_no} 预期 ${p.expected_date} 已超期，请跟进供应商`, 'purchase', p.id);
      notifications++;
    });

    // 3. 委外超期
    const overdueOutsourcing = await req.db.all(
      `SELECT id, order_no, expected_date FROM outsourcing_orders WHERE status NOT IN ('completed', 'received', 'cancelled', 'inspection_passed') AND expected_date < ? AND expected_date IS NOT NULL`,
      [today]
    );
    overdueOutsourcing.forEach(o => {
      sendNotification(req.db, null, 'warning', '委外单超期',
        `委外单 ${o.order_no} 预期 ${o.expected_date} 已超期，请联系供应商`, 'outsourcing', o.id);
      notifications++;
    });

    res.json({ success: true, data: { overdueOrders: overdueOrders.length, overduePurchases: overduePurchases.length, overdueOutsourcing: overdueOutsourcing.length, notifications } });
  } catch (error) {
    console.error('[report/check-overdue]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
