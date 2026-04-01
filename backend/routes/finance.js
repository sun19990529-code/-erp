const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validateId } = require('../middleware/validate');
const { generateOrderNo } = require('../utils/order-number');

// ==================== 应付账款 ====================
router.get('/payables', requirePermission('finance_view'), async (req, res) => {
  try {
    const { status, supplier_id, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT p.*, s.name as supplier_name FROM payables p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND p.status = ?'; params.push(status); }
    if (supplier_id) { sql += ' AND p.supplier_id = ?'; params.push(supplier_id); }
    sql += ' ORDER BY p.created_at DESC';
    const result = await req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    // 汇总（跟随筛选条件）
    let summarySql = `SELECT COUNT(*) as total, COALESCE(SUM(amount),0) as total_amount, COALESCE(SUM(paid_amount),0) as total_paid FROM payables WHERE 1=1`;
    const summaryParams = [];
    if (status) { summarySql += ' AND status = ?'; summaryParams.push(status); }
    if (supplier_id) { summarySql += ' AND supplier_id = ?'; summaryParams.push(supplier_id); }
    const summary = await req.db.get(summarySql, summaryParams);
    res.json({ success: true, data: result.data, pagination: result.pagination, summary: { ...summary, total_unpaid: summary.total_amount - summary.total_paid } });
  } catch (error) {
    console.error('[finance.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 应收账款 ====================
router.get('/receivables', requirePermission('finance_view'), async (req, res) => {
  try {
    const { status, customer_id, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT r.*, c.name as customer_name FROM receivables r LEFT JOIN customers c ON r.customer_id = c.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND r.status = ?'; params.push(status); }
    if (customer_id) { sql += ' AND r.customer_id = ?'; params.push(customer_id); }
    sql += ' ORDER BY r.created_at DESC';
    const result = await req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    let summarySql = `SELECT COUNT(*) as total, COALESCE(SUM(amount),0) as total_amount, COALESCE(SUM(received_amount),0) as total_received FROM receivables WHERE 1=1`;
    const summaryParams = [];
    if (status) { summarySql += ' AND status = ?'; summaryParams.push(status); }
    if (customer_id) { summarySql += ' AND customer_id = ?'; summaryParams.push(customer_id); }
    const summary = await req.db.get(summarySql, summaryParams);
    res.json({ success: true, data: result.data, pagination: result.pagination, summary: { ...summary, total_unreceived: summary.total_amount - summary.total_received } });
  } catch (error) {
    console.error('[finance.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 付款记录 ====================
router.post('/payables/:id/pay', validateId, requirePermission('finance_edit'), async (req, res) => {
  try {
    const { amount, payment_method, operator, remark } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: '付款金额必须大于0' });
    const payable = await req.db.get('SELECT * FROM payables WHERE id = ?', [req.params.id]);
    if (!payable) return res.status(404).json({ success: false, message: '应付单不存在' });
    const remaining = Math.round((payable.amount - payable.paid_amount) * 100) / 100;
    if (Math.round(amount * 100) > Math.round(remaining * 100)) return res.status(400).json({ success: false, message: `付款金额不能超过未付余额 ¥${remaining.toFixed(2)}` });
    
    await req.db.transaction(async () => {
      await req.db.run('INSERT INTO payment_records (payable_id, amount, payment_method, operator, remark) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, amount, payment_method || 'bank', operator, remark]);
      const newPaid = Math.round((payable.paid_amount + amount) * 100) / 100;
      const newStatus = newPaid >= payable.amount ? 'paid' : 'partial';
      await req.db.run('UPDATE payables SET paid_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newPaid, newStatus, req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[finance.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 收款记录 ====================
router.post('/receivables/:id/receive', validateId, requirePermission('finance_edit'), async (req, res) => {
  try {
    const { amount, payment_method, operator, remark } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: '收款金额必须大于0' });
    const receivable = await req.db.get('SELECT * FROM receivables WHERE id = ?', [req.params.id]);
    if (!receivable) return res.status(404).json({ success: false, message: '应收单不存在' });
    const remaining = Math.round((receivable.amount - receivable.received_amount) * 100) / 100;
    if (Math.round(amount * 100) > Math.round(remaining * 100)) return res.status(400).json({ success: false, message: `收款金额不能超过未收余额 ¥${remaining.toFixed(2)}` });
    
    await req.db.transaction(async () => {
      await req.db.run('INSERT INTO payment_records (receivable_id, amount, payment_method, operator, remark) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, amount, payment_method || 'bank', operator, remark]);
      const newReceived = Math.round((receivable.received_amount + amount) * 100) / 100;
      const newStatus = newReceived >= receivable.amount ? 'paid' : 'partial';
      await req.db.run('UPDATE receivables SET received_amount = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newReceived, newStatus, req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[finance.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 付款/收款历史
router.get('/payment-records', requirePermission('finance_view'), async (req, res) => {
  try {
    const { payable_id, receivable_id } = req.query;
    let sql = 'SELECT * FROM payment_records WHERE 1=1';
    const params = [];
    if (payable_id) { sql += ' AND payable_id = ?'; params.push(payable_id); }
    if (receivable_id) { sql += ' AND receivable_id = ?'; params.push(receivable_id); }
    sql += ' ORDER BY created_at DESC';
    const records = await req.db.all(sql, params);
    res.json({ success: true, data: records });
  } catch (error) {
    console.error('[finance.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 财务总览
router.get('/summary', requirePermission('finance_view'), async (req, res) => {
  try {
    const payable = await req.db.get(`SELECT COALESCE(SUM(amount),0) as total, COALESCE(SUM(paid_amount),0) as paid, COUNT(*) as count FROM payables`);
    const receivable = await req.db.get(`SELECT COALESCE(SUM(amount),0) as total, COALESCE(SUM(received_amount),0) as received, COUNT(*) as count FROM receivables`);
    const unpaidPayables = await req.db.get(`SELECT COUNT(*) as count, COALESCE(SUM(amount - paid_amount),0) as amount FROM payables WHERE status != 'paid'`);
    const unreceived = await req.db.get(`SELECT COUNT(*) as count, COALESCE(SUM(amount - received_amount),0) as amount FROM receivables WHERE status != 'paid'`);
    res.json({
      success: true,
      data: {
        payable: { total: payable.total, paid: payable.paid, unpaid: payable.total - payable.paid, count: payable.count },
        receivable: { total: receivable.total, received: receivable.received, unreceived: receivable.total - receivable.received, count: receivable.count },
        unpaid_payables: unpaidPayables,
        unreceived_receivables: unreceived,
        net_position: (receivable.received - payable.paid) // 净现金流
      }
    });
  } catch (error) {
    console.error('[finance.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ========== 工具函数：自动生成应付/应收 ==========
async function createPayable(db, { type, sourceType, sourceId, supplierId, amount, dueDate, remark }) {
  try {
    const orderNo = generateOrderNo('AP');
    await db.run(`INSERT INTO payables (order_no, type, source_type, source_id, supplier_id, amount, due_date, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNo, type, sourceType, sourceId, supplierId, amount, dueDate || null, remark || null]);
    return orderNo;
  } catch (e) { console.error('[finance] 创建应付失败:', e.message); return null; }
}

async function createReceivable(db, { type, sourceType, sourceId, customerId, amount, dueDate, remark }) {
  try {
    const orderNo = generateOrderNo('AR');
    await db.run(`INSERT INTO receivables (order_no, type, source_type, source_id, customer_id, amount, due_date, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderNo, type, sourceType, sourceId, customerId, amount, dueDate || null, remark || null]);
    return orderNo;
  } catch (e) { console.error('[finance] 创建应收失败:', e.message); return null; }
}

module.exports = { router, createPayable, createReceivable };
