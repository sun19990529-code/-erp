const express = require('express');
const router = express.Router();

// ============================================================
// 打印模板管理 API
// 数据库通过中间件 req.getDb() 获取 better-sqlite3 原生实例
// 写操作统一校验管理员权限
// 响应格式统一使用 { success: true/false, data?, message? }
// ============================================================

// 管理员权限校验中间件（仅用于写操作）
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role_code !== 'admin') {
    return res.status(403).json({ success: false, message: '仅管理员可操作打印模板' });
  }
  next();
};

// 获取指定类型的所有模板列表（支持根据 type 过滤）
router.get('/', (req, res) => {
  const db = req.getDb();
  const { type } = req.query;
  try {
    let rows;
    if (type) {
      rows = db.prepare('SELECT id, type, name, is_default, updated_at FROM print_templates WHERE type = ? ORDER BY id DESC').all(type);
    } else {
      rows = db.prepare('SELECT id, type, name, is_default, updated_at FROM print_templates ORDER BY type, id DESC').all();
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取打印模板失败', error: error.message });
  }
});

// ⚠️ 路由顺序关键：/default/:type 必须在 /:id 之前注册
// 获取某数据类型的默认打印模板
router.get('/default/:type', (req, res) => {
  const db = req.getDb();
  try {
    let template = db.prepare('SELECT * FROM print_templates WHERE type = ? AND is_default = 1').get(req.params.type);
    if (!template) {
      template = db.prepare('SELECT * FROM print_templates WHERE type = ? ORDER BY id ASC LIMIT 1').get(req.params.type);
    }
    if (!template) {
      return res.status(404).json({ success: false, message: '系统尚未配置该类型单据的打印模板，请前往「系统管理 - 打印模板引擎」添加' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取默认模板失败', error: error.message });
  }
});

// 获取单一模板的完整内容（按 ID）
router.get('/:id', (req, res) => {
  const db = req.getDb();
  try {
    const template = db.prepare('SELECT * FROM print_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: '模板不存在' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取模板详情失败', error: error.message });
  }
});

// 新增打印模板（仅管理员）
router.post('/', requireAdmin, (req, res) => {
  const db = req.getDb();
  const { type, name, content, is_default } = req.body;

  if (!type || !name || !content) {
    return res.status(400).json({ success: false, message: '类型、模板名称、模板内容为必填项' });
  }

  try {
    let newId;
    db.transaction(() => {
      if (is_default) {
        db.prepare('UPDATE print_templates SET is_default = 0 WHERE type = ?').run(type);
      }
      const r = db.prepare('INSERT INTO print_templates (type, name, content, is_default) VALUES (?, ?, ?, ?)').run(type, name, content, is_default ? 1 : 0);
      newId = Number(r.lastInsertRowid);
    })();
    res.json({ success: true, message: '模板保存成功', data: { id: newId } });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存模板失败', error: error.message });
  }
});

// 修改模板内容（仅管理员）
router.put('/:id', requireAdmin, (req, res) => {
  const db = req.getDb();
  const { name, content, is_default } = req.body;
  if (!name || !content) {
    return res.status(400).json({ success: false, message: '模板名称与内容不能为空' });
  }

  try {
    db.transaction(() => {
      if (is_default) {
        const t = db.prepare('SELECT type FROM print_templates WHERE id = ?').get(req.params.id);
        if (t) {
          db.prepare('UPDATE print_templates SET is_default = 0 WHERE type = ?').run(t.type);
        }
      }
      const r = db.prepare('UPDATE print_templates SET name = ?, content = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(name, content, is_default ? 1 : 0, req.params.id);
      if (r.changes === 0) throw new Error('TEMPLATE_NOT_FOUND');
    })();
    res.json({ success: true, message: '模板更新成功' });
  } catch (error) {
    if (error.message === 'TEMPLATE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '模板不存在' });
    }
    res.status(500).json({ success: false, message: '更新模板失败', error: error.message });
  }
});

// 删除模板（仅管理员）
router.delete('/:id', requireAdmin, (req, res) => {
  const db = req.getDb();
  try {
    const r = db.prepare('DELETE FROM print_templates WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ success: false, message: '模板不存在' });
    res.json({ success: true, message: '模板删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
});

module.exports = router;
