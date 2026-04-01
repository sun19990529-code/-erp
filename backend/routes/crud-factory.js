const express = require('express');
const { requirePermission } = require('../middleware/permission');
const { validateId } = require('../middleware/validate');

// 允许使用 CRUD 工厂的表名白名单
const ALLOWED_TABLES = ['departments', 'customers', 'suppliers'];

/**
 * 通用 CRUD 路由工厂
 * @param {Object} config
 * @param {string} config.table - 表名
 * @param {string[]} config.fields - 可写入的字段列表
 * @param {string} [config.orderBy] - 排序字段
 * @param {string[]} [config.searchFields] - 搜索字段列表
 * @param {Object[]} [config.checkRelations] - 删除前检查关联关系
 * @param {boolean} [config.hasTimestamps] - 是否有 created_at/updated_at 字段
 * @param {string} [config.permissionPrefix] - 权限前缀，如 'basic_data' 会自动挂载 basic_data_view/create/edit/delete
 */
function createCRUDRouter(config) {
  const router = express.Router();
  const {
    table,
    fields,
    orderBy = 'id',
    searchFields = [],
    checkRelations = [],
    hasTimestamps = true,
    permissionPrefix
  } = config;

  if (!ALLOWED_TABLES.includes(table)) {
    throw new Error(`[crud-factory] 表名 "${table}" 不在白名单中，请先添加到 ALLOWED_TABLES`);
  }

  // 权限中间件：有 permissionPrefix 时自动挂载，否则跳过
  const perm = (action) => permissionPrefix ? requirePermission(`${permissionPrefix}_${action}`) : (req, res, next) => next();

  // 列表
  router.get('/', perm('view'), async (req, res) => {
    try {
      const data = await req.db.all(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
      res.json({ success: true, data });
    } catch (error) {
      console.error(`[crud-${table}]`, error.message);
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  });

  // 新增
  router.post('/', perm('create'), async (req, res) => {
    try {
      // 只写入前端实际传了值的字段，未传的让数据库用 DEFAULT
      const activeFields = fields.filter(f => req.body[f] !== undefined);
      const values = activeFields.map(f => req.body[f]);
      const placeholders = activeFields.map(() => '?').join(', ');
      const fieldNames = activeFields.join(', ');
      const info = await req.db.run(`INSERT INTO ${table} (${fieldNames}) VALUES (${placeholders})`, values);
      res.json({ success: true, data: { id: info.lastInsertRowid } });
    } catch (error) {
      console.error(`[crud-${table}]`, error.message);
      if (error.message && error.message.includes('UNIQUE')) {
        return res.status(400).json({ success: false, message: '编码已存在' });
      }
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  });

  // 切换启用/禁用状态（必须在 /:id 之前定义，否则会被通配符拦截）
  if (fields.includes('status')) {
    router.put('/:id/toggle-status', validateId, perm('edit'), async (req, res) => {
      try {
        const row = await req.db.get(`SELECT status FROM ${table} WHERE id = ?`, [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: '记录不存在' });
        const newStatus = row.status === 1 ? 0 : 1;
        await req.db.run(`UPDATE ${table} SET status = ?${hasTimestamps ? ', updated_at = CURRENT_TIMESTAMP' : ''} WHERE id = ?`, [newStatus, req.params.id]);
        res.json({ success: true, data: { status: newStatus } });
      } catch (error) {
        console.error(`[crud-${table}]`, error.message);
        res.status(500).json({ success: false, message: '服务器错误' });
      }
    });
  }

  // 更新（仅更新前端实际传了的字段，防止未传字段被覆盖为 null）
  router.put('/:id', validateId, perm('edit'), async (req, res) => {
    try {
      const activeFields = fields.filter(f => req.body[f] !== undefined);
      if (activeFields.length === 0) return res.status(400).json({ success: false, message: '没有需要更新的字段' });
      const values = activeFields.map(f => req.body[f]);
      const setClause = activeFields.map(f => `${f} = ?`).join(', ');
      const timestampClause = hasTimestamps ? ', updated_at = CURRENT_TIMESTAMP' : '';
      values.push(req.params.id);
      await req.db.run(`UPDATE ${table} SET ${setClause}${timestampClause} WHERE id = ?`, values);
      res.json({ success: true });
    } catch (error) {
      console.error(`[crud-${table}]`, error.message);
      if (error.message && error.message.includes('UNIQUE')) {
        return res.status(400).json({ success: false, message: '编码已存在' });
      }
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  });

  // 删除（带级联保护）
  router.delete('/:id', validateId, perm('delete'), async (req, res) => {
    try {
      // 检查关联关系
      for (const rel of checkRelations) {
        const count = await req.db.get(`SELECT COUNT(*) as count FROM ${rel.table} WHERE ${rel.foreignKey} = ?`, [req.params.id]);
        if (count && count.count > 0) {
          return res.status(400).json({ success: false, message: rel.message || `该记录已被其他数据引用，无法删除` });
        }
      }
      await req.db.run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error(`[crud-${table}]`, error.message);
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  });

  return router;
}

module.exports = { createCRUDRouter };
