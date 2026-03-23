const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');

// GET /api/logs - 查询操作日志（仅管理员）
router.get('/', requirePermission('system_admin'), (req, res) => {
  const db = req.db;
  const { module, user_id, page = 1, pageSize = 50 } = req.query;

  let sql = `
    SELECT ol.*, u.real_name as user_name
    FROM operation_logs ol
    LEFT JOIN users u ON ol.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (module) { sql += ' AND ol.module = ?'; params.push(module); }
  if (user_id) { sql += ' AND ol.user_id = ?'; params.push(user_id); }

  sql += ' ORDER BY ol.created_at DESC';

  const result = db.paginate(sql, params, parseInt(page), parseInt(pageSize));
  res.json({ success: true, ...result });
});

// 工具函数：写入操作日志（供其他路由调用）
function writeLog(db, userId, action, module, targetId, detail) {
  try {
    db.run(
      `INSERT INTO operation_logs (user_id, action, module, target_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
      [userId || null, action, module, targetId || null, detail || null]
    );
  } catch (e) {
    console.error('[LogError]', e.message);
  }
}

module.exports = router;
module.exports.writeLog = writeLog;
