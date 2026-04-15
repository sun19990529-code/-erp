const express = require('express');
const router = express.Router();

// 管理员权限校验（操作日志仅限管理员查看）
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role_code !== 'admin') {
    return res.status(403).json({ success: false, message: '仅管理员可查看操作日志' });
  }
  next();
};

// GET /api/logs - 查询操作日志（仅管理员）
router.get('/', requireAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { module, user_id, keyword, start_date, end_date, page = 1, pageSize = 50 } = req.query;

    let sql = `
      SELECT ol.*, u.real_name as user_name
      FROM operation_logs ol
      LEFT JOIN users u ON ol.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (module) { sql += ' AND ol.module = ?'; params.push(module); }
    if (user_id) { sql += ' AND ol.user_id = ?'; params.push(user_id); }
    if (keyword) { sql += ' AND (ol.action LIKE ? OR ol.detail LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (start_date) { sql += ' AND ol.created_at >= ?'; params.push(start_date + ' 00:00:00'); }
    if (end_date) { sql += ' AND ol.created_at <= ?'; params.push(end_date + ' 23:59:59'); }

    sql += ' ORDER BY ol.created_at DESC';

    const result = await db.paginate(sql, params, parseInt(page), parseInt(pageSize));

    // 统计
    const stats = await db.get(`SELECT COUNT(*) as total FROM operation_logs`);
    const todayCount = await db.get(`SELECT COUNT(*) as count FROM operation_logs WHERE created_at::date = CURRENT_DATE`);

    res.json({ success: true, ...result, stats: { total: stats.total, today: todayCount.count } });
  } catch (error) {
    console.error('[logs.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// GET /api/logs/filters - 获取可筛选的模块列表和用户列表
router.get('/filters', requireAdmin, async (req, res) => {
  try {
    const db = req.db;
    const moduleRows = await db.all(`SELECT DISTINCT module FROM operation_logs ORDER BY module`);
    const modules = moduleRows.map(r => r.module);
    const users = await db.all(`SELECT DISTINCT ol.user_id, u.real_name FROM operation_logs ol LEFT JOIN users u ON ol.user_id = u.id WHERE ol.user_id IS NOT NULL ORDER BY u.real_name`);
    res.json({ success: true, data: { modules, users } });
  } catch (error) {
    console.error('[logs.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 工具函数：写入操作日志（供其他路由调用）
async function writeLog(db, userId, action, module, targetId, detail) {
  try {
    await db.run(
      `INSERT INTO operation_logs (user_id, action, module, target_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [userId || null, action, module, targetId || null, detail || null]
    );
  } catch (e) {
    console.error('[LogError]', e.message);
  }
}

module.exports = router;
module.exports.writeLog = writeLog;
