const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validateId } = require('../middleware/validate');

// 获取当前用户未读通知数
router.get('/unread-count', (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.json({ success: true, data: 0 });
    const result = req.db.get('SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0', [userId]);
    res.json({ success: true, data: result?.count || 0 });
  } catch (error) {
    console.error('[notifications.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 通知列表
router.get('/', (req, res) => {
  try {
    const userId = req.user?.id;
    const { is_read, page = 1, pageSize = 20 } = req.query;
    let sql = 'SELECT * FROM notifications WHERE (user_id = ? OR user_id IS NULL)';
    const params = [userId];
    if (is_read !== undefined && is_read !== '') { sql += ' AND is_read = ?'; params.push(parseInt(is_read)); }
    sql += ' ORDER BY created_at DESC';
    const result = req.db.paginate(sql, params, parseInt(page), parseInt(pageSize));
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    console.error('[notifications.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 标记已读（单条）
router.put('/:id/read', validateId, (req, res) => {
  try {
    req.db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND (user_id = ? OR user_id IS NULL)', [req.params.id, req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[notifications.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 全部标记已读
router.put('/read-all', (req, res) => {
  try {
    req.db.run('UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0', [req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[notifications.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除通知
router.delete('/:id', validateId, (req, res) => {
  try {
    req.db.run('DELETE FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user?.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[notifications.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ========== 通知发送工具函数 ==========
/**
 * 发送通知给指定用户
 * @param {object} db - 数据库实例
 * @param {number|null} userId - 目标用户ID，null 则发给所有管理员
 * @param {string} type - 通知类型：warning/info/success/error
 * @param {string} title - 标题
 * @param {string} content - 内容
 * @param {string} module - 来源模块
 * @param {number} targetId - 关联对象ID
 */
function sendNotification(db, userId, type, title, content, module = '', targetId = null) {
  try {
    if (userId) {
      db.run('INSERT INTO notifications (user_id, type, title, content, module, target_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, type, title, content, module, targetId]);
    } else {
      // 发给所有管理员
      const admins = db.all("SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.code = 'admin'");
      admins.forEach(admin => {
        db.run('INSERT INTO notifications (user_id, type, title, content, module, target_id) VALUES (?, ?, ?, ?, ?, ?)',
          [admin.id, type, title, content, module, targetId]);
      });
    }
  } catch (e) {
    console.error('[notifications] 发送通知失败:', e.message);
  }
}

module.exports = { router, sendNotification };
