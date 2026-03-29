const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');

/**
 * 生产日报 — 按日期区间汇总产量、不良率、物料消耗
 * GET /daily?start=2026-03-01&end=2026-03-31
 */
router.get('/daily', requirePermission('production_view'), (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const endDate = end || new Date().toISOString().slice(0, 10);

    // 按日期汇总所有报工记录
    const dailyData = req.db.all(`
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
router.get('/by-product', requirePermission('production_view'), (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = end || new Date().toISOString().slice(0, 10);

    const data = req.db.all(`
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
router.get('/material-consumption', requirePermission('production_view'), (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = end || new Date().toISOString().slice(0, 10);

    const data = req.db.all(`
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

module.exports = router;
