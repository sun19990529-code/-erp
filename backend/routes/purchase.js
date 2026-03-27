const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validate, validateId } = require('../middleware/validate');
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

router.get('/:id', validateId, requirePermission('purchase_view'), (req, res) => {
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

router.put('/:id/status', validateId, requirePermission('purchase_edit'), (req, res) => {
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

router.put('/:id', validateId, requirePermission('purchase_edit'), (req, res) => {
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

router.delete('/:id', validateId, requirePermission('purchase_delete'), (req, res) => {
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

// ==================== 采购建议单 ====================

/**
 * 智能采购建议 — 综合安全库存 + 订单需求 + 在途采购 + 首选供应商
 * GET /suggestions?category=原材料&threshold=safety|order|both
 */
router.get('/suggestions', requirePermission('purchase_view'), (req, res) => {
  try {
    const { category, threshold = 'both' } = req.query;

    // 1. 获取所有原材料/半成品（采购对象），含安全库存设置
    let productSql = `SELECT p.id, p.code, p.name, p.specification, p.unit, p.category,
      p.min_stock, p.max_stock, p.unit_price as reference_price
      FROM products p WHERE p.status = 1`;
    const productParams = [];
    if (category) {
      productSql += ' AND p.category = ?';
      productParams.push(category);
    } else {
      productSql += " AND p.category IN ('原材料', '半成品')";
    }
    const products = req.db.all(productSql, productParams);
    if (products.length === 0) return res.json({ success: true, data: [] });

    const productIds = products.map(p => p.id);
    const placeholders = productIds.map(() => '?').join(',');

    // 2. 当前库存（按产品汇总）
    const stockRows = req.db.all(`
      SELECT product_id, SUM(quantity) as total_stock
      FROM inventory WHERE product_id IN (${placeholders})
      GROUP BY product_id
    `, productIds);
    const stockMap = Object.fromEntries(stockRows.map(r => [r.product_id, r.total_stock]));

    // 3. 订单需求缺口（未完成订单的未领料量）
    const orderGapRows = req.db.all(`
      SELECT om.material_id as product_id,
        SUM(om.required_quantity - COALESCE(om.picked_quantity, 0)) as shortage
      FROM order_materials om
      JOIN orders o ON om.order_id = o.id
      WHERE o.status IN ('pending', 'confirmed', 'processing')
        AND om.material_id IN (${placeholders})
      GROUP BY om.material_id
      HAVING shortage > 0
    `, productIds);
    const orderGapMap = Object.fromEntries(orderGapRows.map(r => [r.product_id, r.shortage]));

    // 4. 在途采购量（已下单未完成的采购单）
    const inTransitRows = req.db.all(`
      SELECT pi.product_id, SUM(pi.quantity - COALESCE(pi.received_quantity, 0)) as in_transit
      FROM purchase_items pi
      JOIN purchase_orders po ON pi.purchase_order_id = po.id
      WHERE po.status IN ('pending', 'confirmed')
        AND pi.product_id IN (${placeholders})
      GROUP BY pi.product_id
      HAVING in_transit > 0
    `, productIds);
    const inTransitMap = Object.fromEntries(inTransitRows.map(r => [r.product_id, r.in_transit]));

    // 5. 首选供应商
    const supplierRows = req.db.all(`
      SELECT ps.product_id, s.id as supplier_id, s.name as supplier_name, ps.is_default
      FROM product_suppliers ps
      JOIN suppliers s ON ps.supplier_id = s.id
      WHERE ps.product_id IN (${placeholders}) AND s.status = 1
      ORDER BY ps.is_default DESC
    `, productIds);
    const supplierMap = {};
    supplierRows.forEach(r => {
      if (!supplierMap[r.product_id]) supplierMap[r.product_id] = [];
      supplierMap[r.product_id].push(r);
    });

    // 6. 历史采购均价（最近 3 个月）
    const avgPriceRows = req.db.all(`
      SELECT pi.product_id,
        ROUND(AVG(pi.unit_price), 2) as avg_price,
        COUNT(*) as purchase_count
      FROM purchase_items pi
      JOIN purchase_orders po ON pi.purchase_order_id = po.id
      WHERE po.created_at >= datetime('now', '-3 months')
        AND pi.product_id IN (${placeholders})
        AND pi.unit_price > 0
      GROUP BY pi.product_id
    `, productIds);
    const priceMap = Object.fromEntries(avgPriceRows.map(r => [r.product_id, { avg_price: r.avg_price, count: r.purchase_count }]));

    // 7. 计算建议
    const suggestions = [];
    products.forEach(p => {
      const currentStock = stockMap[p.id] || 0;
      const orderGap = orderGapMap[p.id] || 0;
      const inTransit = inTransitMap[p.id] || 0;
      const minStock = p.min_stock || 0;
      const maxStock = p.max_stock || 0;

      // 安全库存缺口 = max(0, 安全库存 - 当前库存 - 在途)
      const safetyGap = minStock > 0 ? Math.max(0, minStock - currentStock - inTransit) : 0;
      // 订单缺口 = max(0, 订单需求 - 当前库存 - 在途)
      const netOrderGap = orderGap > 0 ? Math.max(0, orderGap - currentStock - inTransit) : 0;

      // 是否需要采购
      let needPurchase = false;
      if (threshold === 'safety') needPurchase = safetyGap > 0;
      else if (threshold === 'order') needPurchase = netOrderGap > 0;
      else needPurchase = safetyGap > 0 || netOrderGap > 0;

      if (!needPurchase) return;

      // 建议采购量 = max(安全缺口, 订单缺口)；如果有 max_stock 则补到 max_stock
      let suggestedQty = Math.max(safetyGap, netOrderGap);
      if (maxStock > 0 && (currentStock + inTransit + suggestedQty) < maxStock) {
        suggestedQty = maxStock - currentStock - inTransit;
      }
      suggestedQty = Math.max(suggestedQty, 1); // 至少 1

      const suppliers = supplierMap[p.id] || [];
      const priceInfo = priceMap[p.id] || {};
      const unitPrice = priceInfo.avg_price || p.reference_price || 0;

      // 紧急度判定
      let urgency = 'normal';
      if (currentStock === 0 && orderGap > 0) urgency = 'critical';
      else if (currentStock < minStock * 0.5 && orderGap > 0) urgency = 'high';
      else if (safetyGap > 0) urgency = 'medium';

      suggestions.push({
        product_id: p.id,
        product_code: p.code,
        product_name: p.name,
        specification: p.specification,
        unit: p.unit,
        category: p.category,
        current_stock: currentStock,
        min_stock: minStock,
        max_stock: maxStock,
        order_shortage: orderGap,
        in_transit: inTransit,
        safety_gap: safetyGap,
        order_gap: netOrderGap,
        suggested_quantity: suggestedQty,
        unit_price: unitPrice,
        estimated_amount: parseFloat((suggestedQty * unitPrice).toFixed(2)),
        urgency,
        suppliers: suppliers.map(s => ({
          id: s.supplier_id,
          name: s.supplier_name,
          is_default: s.is_default
        })),
        default_supplier: suppliers.find(s => s.is_default) || suppliers[0] || null,
        price_history: priceInfo
      });
    });

    // 按紧急度排序：critical > high > medium > normal
    const urgencyOrder = { critical: 0, high: 1, medium: 2, normal: 3 };
    suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    res.json({
      success: true,
      data: suggestions,
      summary: {
        total_items: suggestions.length,
        critical_count: suggestions.filter(s => s.urgency === 'critical').length,
        high_count: suggestions.filter(s => s.urgency === 'high').length,
        total_estimated_amount: parseFloat(suggestions.reduce((s, r) => s + r.estimated_amount, 0).toFixed(2))
      }
    });
  } catch (error) {
    console.error('[purchase/suggestions]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 从采购建议一键生成采购单
 * POST /suggestions/create-order
 * body: { supplier_id, items: [{ product_id, quantity, unit_price }], expected_date, remark }
 */
router.post('/suggestions/create-order', requirePermission('purchase_create'), (req, res) => {
  try {
    const { supplier_id, items, expected_date, remark } = req.body;
    if (!supplier_id) return res.status(400).json({ success: false, message: '请选择供应商' });
    if (!items || items.length === 0) return res.status(400).json({ success: false, message: '请至少选择一项物料' });

    const orderNo = generateOrderNo('PU');
    let totalAmount = 0;
    items.forEach(item => { totalAmount += (item.quantity || 0) * (item.unit_price || 0); });

    let purchaseId;
    req.db.transaction(() => {
      const result = req.db.run(
        'INSERT INTO purchase_orders (order_no, supplier_id, total_amount, expected_date, operator, remark) VALUES (?, ?, ?, ?, ?, ?)',
        [orderNo, supplier_id, totalAmount, expected_date || null, '系统建议', remark || '由采购建议自动生成']
      );
      purchaseId = result.lastInsertRowid;
      items.forEach(item => {
        req.db.run(
          'INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [purchaseId, item.product_id, item.quantity, item.unit_price || 0]
        );
      });
    });

    writeLog(req.db, req.user?.id, '采购建议生成采购单', 'purchase', purchaseId, `采购单号: ${orderNo}, ${items.length}项物料`);
    res.json({ success: true, data: { id: purchaseId, order_no: orderNo } });
  } catch (error) {
    console.error('[purchase/suggestions]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
