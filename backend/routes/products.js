const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');

// 产品管理
router.get('/', requirePermission('basic_data_view'), (req, res) => {
  try {
    const { category, supplier_id, customer_id } = req.query;
    let sql = `
      SELECT p.*, s.name as supplier_name,
        (SELECT COUNT(*) FROM product_processes pp WHERE pp.product_id = p.id) as process_count
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE 1=1
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
    const products = req.db.all(sql, params);
    // 附带每个产品的供应商和客户列表
    products.forEach(p => {
      p.suppliers = req.db.all(`
        SELECT ps.*, s.name as supplier_name, s.code as supplier_code
        FROM product_suppliers ps
        JOIN suppliers s ON ps.supplier_id = s.id
        WHERE ps.product_id = ?
      `, [p.id]);
      p.customers = req.db.all(`
        SELECT pc.*, c.name as customer_name, c.code as customer_code
        FROM product_customers pc
        JOIN customers c ON pc.customer_id = c.id
        WHERE pc.product_id = ?
      `, [p.id]);
    });
    res.json({ success: true, data: products });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/', requirePermission('basic_data_create'), (req, res) => {
  try {
    const {
      code, name, specification, unit, category, unit_price,
      min_stock, max_stock, outer_diameter, inner_diameter,
      wall_thickness, length, supplier_id
    } = req.body;
    const result = req.db.run(`
      INSERT INTO products
        (code, name, specification, unit, category, unit_price,
         min_stock, max_stock, outer_diameter, inner_diameter,
         wall_thickness, length, supplier_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      code, name, specification, unit, category, unit_price,
      min_stock || 0, max_stock || 0, outer_diameter || null,
      inner_diameter || null, wall_thickness || null,
      length || null, supplier_id || null
    ]);
    res.json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/:id', requirePermission('basic_data_edit'), (req, res) => {
  try {
    const {
      code, name, specification, unit, category, unit_price, status,
      min_stock, max_stock, outer_diameter, inner_diameter,
      wall_thickness, length, supplier_id
    } = req.body;
    
    const existing = req.db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: '产品不存在' });
    }
    
    req.db.run(`
      UPDATE products
      SET code = ?, name = ?, specification = ?, unit = ?,
          category = ?, unit_price = ?, status = ?,
          min_stock = ?, max_stock = ?,
          outer_diameter = ?, inner_diameter = ?,
          wall_thickness = ?, length = ?, supplier_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [
        code || existing.code,
        name || existing.name,
        specification !== undefined ? specification : existing.specification,
        unit || existing.unit,
        category || existing.category,
        unit_price !== undefined ? unit_price : existing.unit_price,
        status !== undefined ? status : existing.status,
        min_stock !== undefined ? min_stock : existing.min_stock,
        max_stock !== undefined ? max_stock : existing.max_stock,
        outer_diameter !== undefined ? outer_diameter : existing.outer_diameter,
        inner_diameter !== undefined ? inner_diameter : existing.inner_diameter,
        wall_thickness !== undefined ? wall_thickness : existing.wall_thickness,
        length !== undefined ? length : existing.length,
        supplier_id !== undefined ? (supplier_id || null) : existing.supplier_id,
        req.params.id
      ]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.delete('/:id', requirePermission('basic_data_delete'), (req, res) => {
  try {
    // 检查关联
    const invCount = req.db.get('SELECT COUNT(*) as count FROM inventory WHERE product_id = ?', [req.params.id]);
    if (invCount && invCount.count > 0) {
      return res.status(400).json({ success: false, message: '该产品有库存记录，无法删除' });
    }
    req.db.transaction(() => {
      req.db.run('DELETE FROM product_processes WHERE product_id = ?', [req.params.id]);
      req.db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 产品工序流程配置
router.get('/:id/processes', requirePermission('basic_data_view'), (req, res) => {
  try {
    const processes = req.db.all(`
      SELECT pp.*, p.name as process_name, p.code as process_code, p.description
      FROM product_processes pp
      JOIN processes p ON pp.process_id = p.id
      WHERE pp.product_id = ?
      ORDER BY pp.sequence
    `, [req.params.id]);
    res.json({ success: true, data: processes });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/:id/processes', requirePermission('basic_data_edit'), (req, res) => {
  try {
    const { processes } = req.body;
    
    req.db.transaction(() => {
      // 先删除旧的配置（包括材料）
      const oldProcesses = req.db.all('SELECT id FROM product_processes WHERE product_id = ?', [req.params.id]);
      oldProcesses.forEach(op => {
        req.db.run('DELETE FROM process_materials WHERE product_process_id = ?', [op.id]);
      });
      req.db.run('DELETE FROM product_processes WHERE product_id = ?', [req.params.id]);
      
      // 插入新的配置
      const validProcesses = processes.filter(p => p.process_id);
      validProcesses.forEach((p, index) => {
        const result = req.db.run(`
          INSERT INTO product_processes (product_id, process_id, sequence, is_outsourced, estimated_duration, remark)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [req.params.id, p.process_id, p.sequence || index + 1, p.is_outsourced || 0, p.estimated_duration || 0, p.remark]);
        
        if (p.materials && p.materials.length > 0) {
          const productProcessId = result.lastInsertRowid;
          p.materials.filter(m => m.material_id).forEach(m => {
            req.db.run(`
              INSERT INTO process_materials (product_process_id, material_id, quantity, unit, remark)
              VALUES (?, ?, ?, ?, ?)
            `, [productProcessId, m.material_id, m.quantity || 1, m.unit || '公斤', m.remark]);
          });
        }
      });
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取工序材料配置
router.get('/product-processes/:productProcessId/materials', requirePermission('basic_data_view'), (req, res) => {
  try {
    const materials = req.db.all(`
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
router.get('/:id/process-materials', requirePermission('basic_data_view'), (req, res) => {
  try {
    const materials = req.db.all(`
      SELECT pm.*, pp.sequence as process_sequence, pp.process_id,
        p.name as material_name, p.code as material_code,
        p.unit as material_unit, p.category as material_category,
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

router.put('/:id/processes/:processId', requirePermission('basic_data_edit'), (req, res) => {
  try {
    const { sequence, is_outsourced, estimated_duration, remark } = req.body;
    req.db.run(`
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

router.delete('/:id/processes/:processId', requirePermission('basic_data_delete'), (req, res) => {
  try {
    req.db.run('DELETE FROM product_processes WHERE product_id = ? AND process_id = ?', [req.params.id, req.params.processId]);
    res.json({ success: true });
  } catch (error) {
    console.error(`[products.js]`, error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 产品-供应商 多对多管理 ====================
// 获取产品关联的供应商
router.get('/:id/suppliers', requirePermission('basic_data_view'), (req, res) => {
  try {
    const suppliers = req.db.all(`
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
router.put('/:id/suppliers', requirePermission('basic_data_edit'), (req, res) => {
  try {
    const { supplier_ids } = req.body; // [1, 2, 3]
    req.db.transaction(() => {
      req.db.run('DELETE FROM product_suppliers WHERE product_id = ?', [req.params.id]);
      (supplier_ids || []).forEach(sid => {
        req.db.run('INSERT INTO product_suppliers (product_id, supplier_id) VALUES (?, ?)', [req.params.id, sid]);
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[products.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 产品-客户 多对多管理 ====================
router.get('/:id/customers', requirePermission('basic_data_view'), (req, res) => {
  try {
    const customers = req.db.all(`
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

router.put('/:id/customers', requirePermission('basic_data_edit'), (req, res) => {
  try {
    const { customer_ids } = req.body; // [1, 2, 3]
    req.db.transaction(() => {
      req.db.run('DELETE FROM product_customers WHERE product_id = ?', [req.params.id]);
      (customer_ids || []).forEach(cid => {
        req.db.run('INSERT INTO product_customers (product_id, customer_id) VALUES (?, ?)', [req.params.id, cid]);
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[products.js]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
