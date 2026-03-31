const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { writeLog } = require('./logs');
const XLSX = require('xlsx');
const multer = require('multer');

// 内存存储，限制 5MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * 通用导入：解析 Excel Buffer → [{...}, ...]
 */
function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
}

/**
 * 下载导入模板
 * GET /template?type=products|suppliers|customers
 */
router.get('/template', requirePermission('basic_data_view'), (req, res) => {
  try {
    const { type } = req.query;
    const templates = {
      products: {
        sheetName: '产品导入模板',
        headers: ['产品编码*', '产品名称*', '规格型号', '单位', '分类(原材料/半成品/成品)*', '单价', '安全库存', '外径', '内径', '壁厚', '长度', '供应商名称'],
        example: ['P-001', '六角螺栓 M12', 'M12×80', 'kg', '原材料', '50', '100', '89', '73', '8', '6000', '示例供应商']
      },
      suppliers: {
        sheetName: '供应商导入模板',
        headers: ['供应商编码*', '供应商名称*', '联系人', '联系电话', '邮箱', '地址'],
        example: ['S-001', '示例供应商', '张三', '13800138000', 'test@example.com', '上海市浦东新区']
      },
      customers: {
        sheetName: '客户导入模板',
        headers: ['客户编码*', '客户名称*', '联系人', '联系电话', '邮箱', '地址', '信用等级(A/B/C)'],
        example: ['C-001', '示例客户', '李四', '13900139000', 'test@example.com', '北京市朝阳区', 'A']
      }
    };
    const tpl = templates[type];
    if (!tpl) return res.status(400).json({ success: false, message: '无效的模板类型，可选: products/suppliers/customers' });

    const ws = XLSX.utils.aoa_to_sheet([tpl.headers, tpl.example]);
    ws['!cols'] = tpl.headers.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tpl.sheetName);
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(tpl.sheetName)}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('[import/template]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 导入产品
 * POST /products  (multipart/form-data, field: file)
 */
router.post('/products', upload.single('file'), requirePermission('basic_data_create'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
    const rows = parseExcel(req.file.buffer);
    if (rows.length === 0) return res.status(400).json({ success: false, message: '文件为空或格式不正确' });

    let imported = 0, skipped = 0, errors = [];

    req.db.transaction(() => {
      rows.forEach((row, index) => {
        const code = (row['产品编码*'] || row['产品编码'] || '').toString().trim();
        const name = (row['产品名称*'] || row['产品名称'] || '').toString().trim();
        const category = (row['分类(原材料/半成品/成品)*'] || row['分类(raw/semi/finished)*'] || row['分类'] || '').toString().trim();

        if (!code || !name) {
          errors.push(`第 ${index + 2} 行：编码或名称为空，已跳过`);
          skipped++;
          return;
        }

        // 支持中文和英文分类名
        const categoryInputMap = {
          'raw': 'raw', '原材料': 'raw',
          'semi': 'semi', '半成品': 'semi',
          'finished': 'finished', '成品': 'finished'
        };
        const normalizedCategory = categoryInputMap[category];
        if (!normalizedCategory) {
          errors.push(`第 ${index + 2} 行：分类「${category}」无效（可填：原材料/半成品/成品），已跳过`);
          skipped++;
          return;
        }

        // 去重检查
        const existing = req.db.get('SELECT id FROM products WHERE code = ?', [code]);
        if (existing) {
          errors.push(`第 ${index + 2} 行：编码「${code}」已存在，已跳过`);
          skipped++;
          return;
        }

        const categoryDbMap = { raw: '原材料', semi: '半成品', finished: '成品' };

        // 解析尺寸字段
        const outerDiameter = parseFloat(row['外径']) || null;
        const innerDiameter = parseFloat(row['内径']) || null;
        const wallThickness = parseFloat(row['壁厚']) || null;
        const length = parseFloat(row['长度']) || null;

        // 解析供应商（按名称匹配）
        const supplierName = (row['供应商名称'] || '').toString().trim();
        let supplierId = null;
        if (supplierName) {
          const supplier = req.db.get('SELECT id FROM suppliers WHERE name = ?', [supplierName]);
          if (supplier) supplierId = supplier.id;
        }

        req.db.run(
          `INSERT INTO products (code, name, specification, unit, category, unit_price, stock_threshold, outer_diameter, inner_diameter, wall_thickness, length, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [code, name,
            (row['规格型号'] || '').toString().trim(),
            (row['单位'] || 'kg').toString().trim(),
            categoryDbMap[normalizedCategory],
            parseFloat(row['单价']) || 0,
            parseInt(row['安全库存']) || 0,
            outerDiameter, innerDiameter, wallThickness, length, supplierId
          ]
        );
        imported++;
      });
    });

    writeLog(req.db, req.user?.id, '批量导入产品', 'product', null, `导入 ${imported} 条，跳过 ${skipped} 条`);
    res.json({ success: true, data: { imported, skipped, total: rows.length, errors } });
  } catch (error) {
    console.error('[import/products]', error.message);
    res.status(500).json({ success: false, message: '服务器错误: ' + error.message });
  }
});

/**
 * 导入供应商
 * POST /suppliers
 */
router.post('/suppliers', upload.single('file'), requirePermission('basic_data_create'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
    const rows = parseExcel(req.file.buffer);
    if (rows.length === 0) return res.status(400).json({ success: false, message: '文件为空或格式不正确' });

    let imported = 0, skipped = 0, errors = [];

    req.db.transaction(() => {
      rows.forEach((row, index) => {
        const code = (row['供应商编码*'] || row['供应商编码'] || '').toString().trim();
        const name = (row['供应商名称*'] || row['供应商名称'] || '').toString().trim();
        if (!code || !name) { errors.push(`第 ${index + 2} 行：编码或名称为空，已跳过`); skipped++; return; }

        const existing = req.db.get('SELECT id FROM suppliers WHERE code = ? OR name = ?', [code, name]);
        if (existing) { errors.push(`第 ${index + 2} 行：「${code} ${name}」已存在，已跳过`); skipped++; return; }

        req.db.run(
          `INSERT INTO suppliers (code, name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)`,
          [code, name,
            (row['联系人'] || '').toString().trim(),
            (row['联系电话'] || '').toString().trim(),
            (row['邮箱'] || '').toString().trim(),
            (row['地址'] || '').toString().trim()
          ]
        );
        imported++;
      });
    });

    writeLog(req.db, req.user?.id, '批量导入供应商', 'supplier', null, `导入 ${imported} 条，跳过 ${skipped} 条`);
    res.json({ success: true, data: { imported, skipped, total: rows.length, errors } });
  } catch (error) {
    console.error('[import/suppliers]', error.message);
    res.status(500).json({ success: false, message: '服务器错误: ' + error.message });
  }
});

/**
 * 导入客户
 * POST /customers
 */
router.post('/customers', upload.single('file'), requirePermission('basic_data_create'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
    const rows = parseExcel(req.file.buffer);
    if (rows.length === 0) return res.status(400).json({ success: false, message: '文件为空或格式不正确' });

    let imported = 0, skipped = 0, errors = [];

    req.db.transaction(() => {
      rows.forEach((row, index) => {
        const code = (row['客户编码*'] || row['客户编码'] || '').toString().trim();
        const name = (row['客户名称*'] || row['客户名称'] || '').toString().trim();
        if (!code || !name) { errors.push(`第 ${index + 2} 行：编码或名称为空，已跳过`); skipped++; return; }

        const existing = req.db.get('SELECT id FROM customers WHERE code = ? OR name = ?', [code, name]);
        if (existing) { errors.push(`第 ${index + 2} 行：「${code} ${name}」已存在，已跳过`); skipped++; return; }

        req.db.run(
          `INSERT INTO customers (code, name, contact_person, phone, email, address, credit_level) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [code, name,
            (row['联系人'] || '').toString().trim(),
            (row['联系电话'] || '').toString().trim(),
            (row['邮箱'] || '').toString().trim(),
            (row['地址'] || '').toString().trim(),
            (row['信用等级(A/B/C)'] || row['信用等级'] || '').toString().trim() || null
          ]
        );
        imported++;
      });
    });

    writeLog(req.db, req.user?.id, '批量导入客户', 'customer', null, `导入 ${imported} 条，跳过 ${skipped} 条`);
    res.json({ success: true, data: { imported, skipped, total: rows.length, errors } });
  } catch (error) {
    console.error('[import/customers]', error.message);
    res.status(500).json({ success: false, message: '服务器错误: ' + error.message });
  }
});

module.exports = router;
