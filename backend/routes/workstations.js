const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');

// 获取机台列表
router.get('/', requirePermission('basic_data_view'), async (req, res) => {
  try {
    const { process } = req.query;
    let sql = 'SELECT * FROM workstations WHERE 1=1';
    let params = [];
    if (process) {
      sql += ' AND process_name = ?';
      params.push(process);
    }
    sql += ' ORDER BY created_at DESC';
    const data = await req.db.all(sql, params);
    
    // Convert schema_config from string to JSON if needed
    const parsedData = data.map(d => ({
      ...d,
      schema_config: typeof d.schema_config === 'string' ? JSON.parse(d.schema_config) : (d.schema_config || {})
    }));
    
    res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('[workstations get]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 新增机台
router.post('/', requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const { code, name, process_name, lines_count, schema_config, status } = req.body;
    
    const existing = await req.db.get('SELECT id FROM workstations WHERE code = ?', [code]);
    if (existing) {
      return res.status(400).json({ success: false, message: '机台编号已存在' });
    }

    const schemaStr = schema_config ? JSON.stringify(schema_config) : '{}';

    await req.db.run(
      'INSERT INTO workstations (code, name, process_name, lines_count, schema_config, status) VALUES (?, ?, ?, ?, ?, ?)',
      [code, name, process_name, lines_count || 1, schemaStr, status || 'active']
    );

    res.json({ success: true, message: '新增成功' });
  } catch (error) {
    console.error('[workstations post]', error.message);
    res.status(500).json({ success: false, message: '新增机台失败' });
  }
});

// 修改机台
router.put('/:id', requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const { code, name, process_name, lines_count, schema_config, status } = req.body;
    
    const existing = await req.db.get('SELECT id FROM workstations WHERE code = ? AND id != ?', [code, req.params.id]);
    if (existing) {
      return res.status(400).json({ success: false, message: '机台编号已存在' });
    }

    const schemaStr = schema_config ? JSON.stringify(schema_config) : '{}';

    await req.db.run(
      'UPDATE workstations SET code=?, name=?, process_name=?, lines_count=?, schema_config=?, status=? WHERE id=?',
      [code, name, process_name, lines_count || 1, schemaStr, status || 'active', req.params.id]
    );

    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('[workstations put]', error.message);
    res.status(500).json({ success: false, message: '更新机台失败' });
  }
});

// 删除机台
router.delete('/:id', requirePermission('basic_data_delete'), async (req, res) => {
  try {
    // Check if used in production
    const used = await req.db.get('SELECT id FROM production_process_records WHERE workstation_id = ? LIMIT 1', [req.params.id]);
    if (used) {
      return res.status(400).json({ success: false, message: '该机台已有实际生产记录流转，无法硬删除，请执行停机动作。' });
    }

    await req.db.run('DELETE FROM workstations WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('[workstations delete]', error.message);
    res.status(500).json({ success: false, message: '删除失败' });
  }
});

module.exports = router;
