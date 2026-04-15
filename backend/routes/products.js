const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { validateId } = require('../middleware/validate');

// 产品字段列表（避免 POST/PUT 各写一遍）
const PRODUCT_FIELDS = [
  'code', 'name', 'specification', 'unit', 'category', 'unit_price',
  'min_stock', 'max_stock', 'outer_diameter', 'inner_diameter',
  'wall_thickness', 'length', 'supplier_id', 'material_category_id',
  'tolerance_od', 'tolerance_id', 'tolerance_wt', 'tolerance_len',
  'tolerance_od_lower', 'tolerance_id_lower', 'tolerance_wt_lower', 'tolerance_len_lower'
];
const pickFields = (body) => PRODUCT_FIELDS.map(f => body[f] !== undefined ? (body[f] || null) : null);
const mergeFields = (body, existing) => PRODUCT_FIELDS.map(f => body[f] !== undefined ? body[f] : existing[f]);

// 产品管理
router.get('/', requirePermission('basic_data_view'), async (req, res) => {
  try {
    const { category, supplier_id, customer_id } = req.query;
    let sql = `
      SELECT p.*, s.name as supplier_name,
        (SELECT COUNT(*) FROM product_processes pp WHERE pp.product_id = p.id) as process_count
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE (p.is_deleted IS NULL OR p.is_deleted = 0)
    `;
    const params = [];
    if (category) {
      sql += ' AND p.category = ?';
      params.push(category);
    }
    if (supplier_id) {
      // 多对多过滤：查找 product_suppliers 中关联了该供应商的产品
      sql += ' AND p.id IN (SELECT product_id FROM product_suppliers WHERE supplier_id = ?)';
      params.push(supplier_id);
    }
    if (customer_id) {
      sql += ' AND p.id IN (SELECT product_id FROM product_customers WHERE customer_id = ?)';
      params.push(customer_id);
    }
    sql += ' ORDER BY p.id DESC';
    const products = await req.db.all(sql, params);
    if (products.length > 0) {
      // 批量查询供应商和客户关联（消除 N+1）
      const pids = products.map(p => p.id);
      const ph = pids.map(() => '?').join(',');
      const allSuppliers = await req.db.all(`
        SELECT ps.*, s.name as supplier_name, s.code as supplier_code
        FROM product_suppliers ps
        JOIN suppliers s ON ps.supplier_id = s.id
        WHERE ps.product_id IN (${ph})
      `, pids);
      const allCustomers = await req.db.all(`
        SELECT pc.*, c.name as customer_name, c.code as customer_code
        FROM product_customers pc
        JOIN customers c ON pc.customer_id = c.id
        WHERE pc.product_id IN (${ph})
      `, pids);
      const supplierMap = new Map();
      const customerMap = new Map();
      allSuppliers.forEach(s => {
        if (!supplierMap.has(s.product_id)) supplierMap.set(s.product_id, []);
        supplierMap.get(s.product_id).push(s);
      });
      allCustomers.forEach(c => {
        if (!customerMap.has(c.product_id)) customerMap.set(c.product_id, []);
        customerMap.get(c.product_id).push(c);
      });
      products.forEach(p => {
        p.suppliers = supplierMap.get(p.id) || [];
        p.customers = customerMap.get(p.id) || [];
      });
      // 批量查询绑定物料
      const allBoundMats = await req.db.all(`
        SELECT pbm.product_id, pbm.material_id, p.name as material_name, p.code as material_code, p.category as material_category
        FROM product_bound_materials pbm
        JOIN products p ON pbm.material_id = p.id
        WHERE pbm.product_id IN (${ph})
      `, pids);
      const boundMatMap = new Map();
      allBoundMats.forEach(m => {
        if (!boundMatMap.has(m.product_id)) boundMatMap.set(m.product_id, []);
        boundMatMap.get(m.product_id).push(m);
      });
      products.forEach(p => {
        p.bound_materials = boundMatMap.get(p.id) || [];
      });
    }
    res.json({ success: true, data: products });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('basic_data_create'), async (req, res) => {
  try {
    const { code, name } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, message: '产品编码和名称为必填项' });
    }
    const dup = await req.db.get('SELECT id FROM products WHERE code = ?', [code]);
    if (dup) {
      return res.status(400).json({ success: false, message: `产品编码「${code}」已存在` });
    }
    const ph = PRODUCT_FIELDS.map(() => '?').join(', ');
    const cols = PRODUCT_FIELDS.join(', ');
    const result = await req.db.run(`INSERT INTO products (${cols}) VALUES (${ph})`, pickFields(req.body));
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', validateId, requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const existing = await req.db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: '产品不存在' });
    }
    const sets = PRODUCT_FIELDS.map(f => `${f} = ?`).join(', ');
    await req.db.run(
      `UPDATE products SET ${sets}, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...mergeFields(req.body, existing), req.body.status !== undefined ? req.body.status : existing.status, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', validateId, requirePermission('basic_data_delete'), async (req, res) => {
  try {
    // 检查关联
    const invCount = await req.db.get('SELECT COUNT(*) as count FROM inventory WHERE product_id = ?', [req.params.id]);
    if (invCount && invCount.count > 0) {
      return res.status(400).json({ success: false, message: '该产品有库存记录，无法删除' });
    }
    // 软删除：仅标记为已删除，保留产品记录以供历史单据关联查询
    await req.db.run('UPDATE products SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 产品工序流程配置
router.get('/:id/processes', validateId, requirePermission('basic_data_view'), async (req, res) => {
  try {
    const processes = await req.db.all(`
      SELECT pp.*, p.name as process_name, p.code as process_code, p.description,
        op.name as output_product_name, op.code as output_product_code
      FROM product_processes pp
      JOIN processes p ON pp.process_id = p.id
      LEFT JOIN products op ON pp.output_product_id = op.id
      WHERE pp.product_id = ?
      ORDER BY pp.sequence
    `, [req.params.id]);
    res.json({ success: true, data: processes });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/:id/processes', validateId, requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const { processes } = req.body;
    
    await req.db.transaction(async () => {
      // 先删除旧的配置（包括材料）
      const oldProcesses = await req.db.all('SELECT id FROM product_processes WHERE product_id = ?', [req.params.id]);
      for (const op of oldProcesses) {
        await req.db.run('DELETE FROM process_materials WHERE product_process_id = ?', [op.id]);
      }
      await req.db.run('DELETE FROM product_processes WHERE product_id = ?', [req.params.id]);
      
      // 插入新的配置
      const validProcesses = processes.filter(p => p.process_id);
      for (let index = 0; index < validProcesses.length; index++) {
        const p = validProcesses[index];
        const result = await req.db.run(`
          INSERT INTO product_processes (product_id, process_id, sequence, is_outsourced, estimated_duration, remark, output_product_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [req.params.id, p.process_id, p.sequence || index + 1, p.is_outsourced || 0, p.estimated_duration || 0, p.remark, p.output_product_id || null]);
        
        if (p.materials && p.materials.length > 0) {
          const productProcessId = result.lastInsertRowid;
          for (const m of p.materials.filter(m => m.material_id)) {
            await req.db.run(`
              INSERT INTO process_materials (product_process_id, material_id, quantity, unit, remark)
              VALUES (?, ?, ?, ?, ?)
            `, [productProcessId, m.material_id, m.quantity || 0, m.unit || '公斤', m.remark]);
          }
        }
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取工序材料配置
router.get('/product-processes/:productProcessId/materials', requirePermission('basic_data_view'), async (req, res) => {
  try {
    const materials = await req.db.all(`
      SELECT pm.*, p.name as material_name, p.code as material_code, p.unit as material_unit, p.category as material_category
      FROM process_materials pm
      JOIN products p ON pm.material_id = p.id
      WHERE pm.product_process_id = ?
    `, [req.params.productProcessId]);
    res.json({ success: true, data: materials });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取产品所有工序的材料配置
router.get('/:id/process-materials', validateId, requirePermission('basic_data_view'), async (req, res) => {
  try {
    const materials = await req.db.all(`
      SELECT pm.*, pp.sequence as process_sequence, pp.process_id,
        p.name as material_name, p.code as material_code,
        p.unit as material_unit, p.category as material_category,
        p.outer_diameter, p.wall_thickness, p.length,
        pr.name as process_name
      FROM process_materials pm
      JOIN product_processes pp ON pm.product_process_id = pp.id
      JOIN products p ON pm.material_id = p.id
      JOIN processes pr ON pp.process_id = pr.id
      WHERE pp.product_id = ?
      ORDER BY pp.sequence
    `, [req.params.id]);
    res.json({ success: true, data: materials });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/processes/:processId', validateId, requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const { sequence, is_outsourced, estimated_duration, remark } = req.body;
    await req.db.run(`
      UPDATE product_processes 
      SET sequence = ?, is_outsourced = ?, estimated_duration = ?, remark = ?
      WHERE product_id = ? AND process_id = ?
    `, [sequence, is_outsourced, estimated_duration, remark, req.params.id, req.params.processId]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id/processes/:processId', validateId, requirePermission('basic_data_delete'), async (req, res) => {
  try {
    await req.db.run('DELETE FROM product_processes WHERE product_id = ? AND process_id = ?', [req.params.id, req.params.processId]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 产品-供应商 多对多管理 ====================
// 获取产品关联的供应商
router.get('/:id/suppliers', validateId, requirePermission('basic_data_view'), async (req, res) => {
  try {
    const suppliers = await req.db.all(`
      SELECT ps.*, s.name as supplier_name, s.code as supplier_code
      FROM product_suppliers ps
      JOIN suppliers s ON ps.supplier_id = s.id
      WHERE ps.product_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: suppliers });
  } catch (error) {
    console.error('[products.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 设置产品关联的供应商（全量替换）
router.put('/:id/suppliers', validateId, requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const { supplier_ids } = req.body; // [1, 2, 3]
    await req.db.transaction(async () => {
      await req.db.run('DELETE FROM product_suppliers WHERE product_id = ?', [req.params.id]);
      for (const sid of (supplier_ids || [])) {
        await req.db.run('INSERT INTO product_suppliers (product_id, supplier_id) VALUES (?, ?)', [req.params.id, sid]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[products.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 产品-客户 多对多管理 ====================
router.get('/:id/customers', validateId, requirePermission('basic_data_view'), async (req, res) => {
  try {
    const customers = await req.db.all(`
      SELECT pc.*, c.name as customer_name, c.code as customer_code
      FROM product_customers pc
      JOIN customers c ON pc.customer_id = c.id
      WHERE pc.product_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: customers });
  } catch (error) {
    console.error('[products.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/customers', validateId, requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const { customer_ids } = req.body; // [1, 2, 3]
    await req.db.transaction(async () => {
      await req.db.run('DELETE FROM product_customers WHERE product_id = ?', [req.params.id]);
      for (const cid of (customer_ids || [])) {
        await req.db.run('INSERT INTO product_customers (product_id, customer_id) VALUES (?, ?)', [req.params.id, cid]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[products.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 成品-绑定物料 多对多管理 ====================
router.get('/:id/bound-materials', validateId, requirePermission('basic_data_view'), async (req, res) => {
  try {
    const materials = await req.db.all(`
      SELECT pbm.*, p.name as material_name, p.code as material_code, p.category as material_category, p.specification
      FROM product_bound_materials pbm
      JOIN products p ON pbm.material_id = p.id
      WHERE pbm.product_id = ?
    `, [req.params.id]);
    res.json({ success: true, data: materials });
  } catch (error) {
    console.error('[products.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id/bound-materials', validateId, requirePermission('basic_data_edit'), async (req, res) => {
  try {
    const { material_ids } = req.body;
    if (material_ids && !Array.isArray(material_ids)) {
      return res.status(400).json({ success: false, message: 'material_ids 必须为数组' });
    }
    await req.db.transaction(async () => {
      await req.db.run('DELETE FROM product_bound_materials WHERE product_id = ?', [req.params.id]);
      for (const mid of (material_ids || [])) {
        await req.db.run('INSERT INTO product_bound_materials (product_id, material_id) VALUES (?, ?)', [req.params.id, parseInt(mid)]);
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[products.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
