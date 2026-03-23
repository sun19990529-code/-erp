const express = require('express');
const router = express.Router();

// 仪表盘
router.get('/', (req, res) => {
  try {
    const pendingOrders = req.db.get("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'");
    const processingOrders = req.db.get("SELECT COUNT(*) as count FROM production_orders WHERE status = 'processing'");
    const pendingInspections = req.db.get("SELECT COUNT(*) as count FROM final_inspections WHERE result IS NULL");
    // 【联动#7】质检暂停告警
    const qualityHoldOrders = req.db.get("SELECT COUNT(*) as count FROM production_orders WHERE status = 'quality_hold'");
    const lowStock = req.db.all(`
      SELECT p.name, p.code, p.min_stock as alert_threshold, SUM(COALESCE(i.quantity, 0)) as quantity 
      FROM products p 
      LEFT JOIN inventory i ON i.product_id = p.id 
      WHERE p.status = 1
      GROUP BY p.id 
      HAVING p.min_stock > 0 AND quantity < p.min_stock
    `);
    
    res.json({
      success: true,
      data: {
        pendingOrders: pendingOrders?.count || 0,
        processingOrders: processingOrders?.count || 0,
        pendingInspections: pendingInspections?.count || 0,
        qualityHoldOrders: qualityHoldOrders?.count || 0,
        lowStock: lowStock
      }
    });
  } catch (error) {
    console.error(`[dashboard.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取图表聚合数据
router.get('/charts', (req, res) => {
  try {
    // 1. 订单状态分布
    const orderStatusStr = req.db.all("SELECT status, COUNT(*) as value FROM orders GROUP BY status");
    const statusMap = {
      'pending': '待确认',
      'confirmed': '已确认',
      'processing': '生产中',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    const orderStatus = orderStatusStr.map(s => ({
      name: statusMap[s.status] || s.status,
      value: s.value
    }));

    // 2. 近7天接单与排产走势
    const trendsRaw = req.db.all(`
      SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
      FROM orders GROUP BY substr(created_at, 1, 10) ORDER BY date DESC LIMIT 15
    `);
    
    const prodTrendsRaw = req.db.all(`
      SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
      FROM production_orders GROUP BY substr(created_at, 1, 10) ORDER BY date DESC LIMIT 15
    `);

    const today = new Date();
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      // 兼容时区处理，避免本地产生跨天误差
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const ordersCount = trendsRaw.find(t => t.date === dateStr)?.count || 0;
      const prodCount = prodTrendsRaw.find(t => t.date === dateStr)?.count || 0;
      
      trendData.push({
        date: `${month}-${day}`,
        orders: ordersCount,
        productions: prodCount
      });
    }

    res.json({
      success: true,
      data: {
        orderStatus,
        trendData
      }
    });

  } catch (error) {
   console.error(`[dashboard.js]`, error.message);
    console.error("Charts API Error:", error);
    res.status(500).json({ success: false, message: '获取图表数据失败' });
  }
});

// 【联动#8】采购建议：根据订单材料需求 + 当前库存计算缺口
router.get('/purchase-suggestions', (req, res) => {
  try {
    // 获取所有未完成订单的材料需求缺口
    const suggestions = req.db.all(`
      SELECT om.material_id, p.code, p.name, p.unit, p.specification,
        SUM(om.required_quantity) as total_required,
        SUM(COALESCE(om.picked_quantity, 0)) as total_picked,
        SUM(om.required_quantity - COALESCE(om.picked_quantity, 0)) as shortage,
        COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id = om.material_id), 0) as current_stock
      FROM order_materials om
      JOIN products p ON om.material_id = p.id
      JOIN orders o ON om.order_id = o.id
      WHERE o.status IN ('pending', 'confirmed', 'processing')
      GROUP BY om.material_id
      HAVING shortage > 0
    `);
    // 筛选出库存不足以覆盖缺口的材料
    const needPurchase = suggestions.filter(s => s.current_stock < s.shortage).map(s => ({
      ...s,
      need_purchase: s.shortage - s.current_stock
    }));
    res.json({ success: true, data: needPurchase });
  } catch (error) {
    console.error(`[dashboard.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
