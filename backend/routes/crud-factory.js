const express = require('express');
const { requirePermission } = require('../middleware/permission');

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

  // 权限中间件：有 permissionPrefix 时自动挂载，否则跳过
  const perm = (action) => permissionPrefix ? requirePermission(`${permissionPrefix}_${action}`) : (req, res, next) => next();

  // 列表
  router.get('/', perm('view'), (req, res) => {
    try {
      const data = req.db.all(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
      res.json({ success: true, data });
    } catch (error) {
      console.error(`[crud-${table}]`, error.message);
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  });

  // 新增
  router.post('/', perm('create'), (req, res) => {
    try {
      const values = fields.map(f => req.body[f] !== undefined ? req.body[f] : null);
      const placeholders = fields.map(() => '?').join(', ');
      const fieldNames = fields.join(', ');
      req.db.run(`INSERT INTO ${table} (${fieldNames}) VALUES (${placeholders})`, values);
      res.json({ success: true });
    } catch (error) {
      console.error(`[crud-${table}]`, error.message);
      if (error.message && error.message.includes('UNIQUE')) {
        return res.status(400).json({ success: false, message: '编码已存在' });
      }
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  });

  // 更新
  router.put('/:id', perm('edit'), (req, res) => {
    try {
      const values = fields.map(f => req.body[f] !== undefined ? req.body[f] : null);
      const setClause = fields.map(f => `${f} = ?`).join(', ');
      const timestampClause = hasTimestamps ? ', updated_at = CURRENT_TIMESTAMP' : '';
      values.push(req.params.id);
      req.db.run(`UPDATE ${table} SET ${setClause}${timestampClause} WHERE id = ?`, values);
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
  router.delete('/:id', perm('delete'), (req, res) => {
    try {
      // 检查关联关系
      for (const rel of checkRelations) {
        const count = req.db.get(`SELECT COUNT(*) as count FROM ${rel.table} WHERE ${rel.foreignKey} = ?`, [req.params.id]);
        if (count && count.count > 0) {
          return res.status(400).json({ success: false, message: rel.message || `该记录已被其他数据引用，无法删除` });
        }
      }
      req.db.run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error(`[crud-${table}]`, error.message);
      res.status(500).json({ success: false, message: '服务器错误' });
    }
  });

  return router;
}

module.exports = { createCRUDRouter };
