const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validateId } = require('../middleware/validate');

// 树形组装（HashMap O(n)）
function buildTree(items, parentId = null) {
  const map = new Map();
  const roots = [];
  items.sort((a, b) => a.sort_order - b.sort_order);
  items.forEach(i => map.set(i.id, { ...i, children: [] }));
  items.forEach(i => {
    const node = map.get(i.id);
    if (i.parent_id && map.has(i.parent_id)) {
      map.get(i.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

// 获取所有分类（树形）
router.get('/', requirePermission('basic_data_view'), async (req, res) => {
  try {
    const { flat } = req.query;
    const all = await req.db.all('SELECT * FROM material_categories ORDER BY sort_order, id');
    if (flat === '1') {
      return res.json({ success: true, data: all });
    }
    res.json({ success: true, data: buildTree(all) });
  } catch (error) {
    console.error('[material-categories]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 新增分类（sort_order 自动递增）
router.post('/', requirePermission('basic_data_create'), async (req, res) => {
  try {
    const { name, parent_id, sort_order, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '名称不能为空' });
    // 自动计算排序号：同级最大值 + 1
    let finalSort = sort_order;
    if (finalSort === undefined || finalSort === null || finalSort === 0) {
      const q = parent_id ? 'parent_id = ?' : 'parent_id IS NULL';
      const p = parent_id ? [parent_id] : [];
      const max = await req.db.get(`SELECT MAX(sort_order) as m FROM material_categories WHERE ${q}`, p);
      finalSort = (max?.m || 0) + 1;
    }
    const result = await req.db.run(
      'INSERT INTO material_categories (name, parent_id, sort_order, description) VALUES (?, ?, ?, ?)',
      [name, parent_id || null, finalSort, description || null]
    );
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('[material-categories]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 排序交换：将 id 与相邻元素交换 sort_order
router.post('/reorder', requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const { id, direction } = req.body; // direction: 'up' | 'down'
    if (!id || !['up', 'down'].includes(direction)) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }
    const current = await req.db.get('SELECT * FROM material_categories WHERE id = ?', [id]);
    if (!current) return res.status(404).json({ success: false, message: '分类不存在' });

    // 找同级相邻元素
    const op = direction === 'up' ? '<' : '>';
    const order = direction === 'up' ? 'DESC' : 'ASC';
    const q1 = current.parent_id ? 'parent_id = ?' : 'parent_id IS NULL';
    const params = current.parent_id ? [current.parent_id, current.sort_order] : [current.sort_order];
    const sibling = await req.db.get(
      `SELECT * FROM material_categories WHERE ${q1} AND sort_order ${op} ? ORDER BY sort_order ${order} LIMIT 1`,
      params
    );
    if (!sibling) return res.json({ success: true, message: '已在边界' });

    // 交换 sort_order（事务保证原子性）
    await req.db.transaction(async () => {
      await req.db.run('UPDATE material_categories SET sort_order = ? WHERE id = ?', [sibling.sort_order, current.id]);
      await req.db.run('UPDATE material_categories SET sort_order = ? WHERE id = ?', [current.sort_order, sibling.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[material-categories]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 编辑分类
router.put('/:id', validateId, requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const { name, parent_id, sort_order, description, status } = req.body;
    const existing = await req.db.get('SELECT id FROM material_categories WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: '分类不存在' });
    }
    await req.db.run(
      'UPDATE material_categories SET name = ?, parent_id = ?, sort_order = ?, description = ?, status = ? WHERE id = ?',
      [name, parent_id || null, sort_order || 0, description || null, status ?? 1, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[material-categories]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除分类
router.delete('/:id', validateId, requirePermission('basic_data_delete'), async (req, res) => {
  try {
    // 检查是否有子分类
    const children = await req.db.get('SELECT COUNT(*) as count FROM material_categories WHERE parent_id = ?', [req.params.id]);
    if (children?.count > 0) {
      return res.status(400).json({ success: false, message: '该分类下有子分类，不能直接删除' });
    }
    // 检查是否有产品关联
    const products = await req.db.get('SELECT COUNT(*) as count FROM products WHERE material_category_id = ?', [req.params.id]);
    if (products?.count > 0) {
      return res.status(400).json({ success: false, message: '该分类下有关联产品，不能删除' });
    }
    await req.db.run('DELETE FROM material_categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[material-categories]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
