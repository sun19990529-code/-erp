const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/permission');
const { writeLog } = require('./logs');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { parseSpecification, getOrCreateMaterialCategory } = require('../utils/specParser');
const { pinyin } = require('pinyin-pro');

// 内存存储，限制 5MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * 通用导入：解析 Excel Buffer → [{...}, ...]
 */
async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const results = [];
  const headers = [];

  worksheet.eachRow({ includeEmpty: false }, function(row, rowNumber) {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = cell.text;
      });
    } else {
      const rowData = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          rowData[header] = cell.text ?? '';
        }
      });
      if (Object.values(rowData).some(v => v !== '')) {
        results.push(rowData);
      }
    }
  });
  return results;
}

/**
 * 下载导入模板
 * GET /template?type=products|suppliers|customers
 */
router.get('/template', requirePermission('basic_data_view'), async (req, res) => {
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
        headers: ['供应商编码', '供应商名称*', '联系人', '联系电话', '邮箱', '地址'],
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

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(tpl.sheetName);
    
    worksheet.addRow(tpl.headers);
    worksheet.addRow(tpl.example);
    
    worksheet.columns.forEach(column => {
      column.width = 18;
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(tpl.sheetName)}.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('[import/template]', error.message);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * 导入产品
 * POST /products  (multipart/form-data, field: file)
 */
router.post('/products', requirePermission('basic_data_create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
    const rows = await parseExcel(req.file.buffer);
    if (rows.length === 0) return res.status(400).json({ success: false, message: '文件为空或格式不正确' });

    let imported = 0, skipped = 0, errors = [];

    await req.db.transaction(async () => {
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const code = (row['产品编码*'] || row['产品编码'] || '').toString().trim();
        const name = (row['产品名称*'] || row['产品名称'] || '').toString().trim();
        const category = (row['分类(原材料/半成品/成品)*'] || row['分类(raw/semi/finished)*'] || row['分类'] || '').toString().trim();

        if (!code || !name) {
          errors.push(`第 ${index + 2} 行：编码或名称为空，已跳过`);
          skipped++;
          continue;
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
          continue;
        }

        const categoryDbMap = { raw: '原材料', semi: '半成品', finished: '成品' };

        // 解析尺寸与关联供应商（提前提取，供插入与更新使用）
        const outerDiameter = parseFloat(row['外径']) || null;
        const innerDiameter = parseFloat(row['内径']) || null;
        const wallThickness = parseFloat(row['壁厚']) || null;
        const length = parseFloat(row['长度']) || null;

        const supplierName = (row['供应商名称'] || '').toString().trim();
        let supplierId = null;
        if (supplierName) {
          const supplier = await req.db.get('SELECT id FROM suppliers WHERE name = ?', [supplierName]);
          if (supplier) supplierId = supplier.id;
        }

        // 去重检查与软删除激活
        const existing = await req.db.get('SELECT id, is_deleted FROM products WHERE code = ?', [code]);
        if (existing) {
          if (existing.is_deleted === 1) {
            // 被软删除的产品，直接在该位置覆盖更新并激活还原，不作为错误跳过
            await req.db.run(`
              UPDATE products SET
                name = ?, specification = ?, unit = ?, category = ?, unit_price = ?, stock_threshold = ?,
                outer_diameter = ?, inner_diameter = ?, wall_thickness = ?, length = ?, supplier_id = ?,
                is_deleted = 0, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [
              name,
              (row['规格型号'] || '').toString().trim(),
              (row['单位'] || 'kg').toString().trim(),
              categoryDbMap[normalizedCategory],
              parseFloat(row['单价']) || 0,
              parseInt(row['安全库存']) || 0,
              outerDiameter, innerDiameter, wallThickness, length, supplierId,
              existing.id
            ]);

            if (existing.id && supplierId) {
              const relation = await req.db.get(
                "SELECT id FROM product_suppliers WHERE product_id = ? AND supplier_id = ?",
                [existing.id, supplierId]
              );
              if (!relation) {
                await req.db.run(
                  "INSERT INTO product_suppliers (product_id, supplier_id) VALUES (?, ?)",
                  [existing.id, supplierId]
                );
              }
            }
            imported++;
            continue;
          } else {
            errors.push(`第 ${index + 2} 行：编码「${code}」已存在，已跳过`);
            skipped++;
            continue;
          }
        }

        const insProd = await req.db.run(
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
        const productId = insProd.lastInsertRowid;
        if (productId && supplierId) {
          await req.db.run(
            `INSERT INTO product_suppliers (product_id, supplier_id) VALUES (?, ?)`,
            [productId, supplierId]
          );
        }
        imported++;
      }
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
router.post('/suppliers', requirePermission('basic_data_create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
    const rows = await parseExcel(req.file.buffer);
    if (rows.length === 0) return res.status(400).json({ success: false, message: '文件为空或格式不正确' });

    let imported = 0, skipped = 0, errors = [];

    await req.db.transaction(async () => {
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const name = (row['供应商名称*'] || row['供应商名称'] || '').toString().trim();
        if (!name) { errors.push(`第 ${index + 2} 行：供应商名称为空，已跳过`); skipped++; continue; }

        let code = (row['供应商编码*'] || row['供应商编码'] || '').toString().trim();
        if (!code) {
          code = await generateSupplierInitialsCode(req.db, name);
        }

        const existing = await req.db.get('SELECT id, is_deleted FROM suppliers WHERE name = ?', [name]);
        if (existing) {
          if (existing.is_deleted === 1) {
            // 被软删除的供应商，直接更新并激活还原
            await req.db.run(
              `UPDATE suppliers SET code = ?, contact_person = ?, phone = ?, email = ?, address = ?, is_deleted = 0, status = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [
                code,
                (row['联系人'] || '').toString().trim(),
                (row['联系电话'] || '').toString().trim(),
                (row['邮箱'] || '').toString().trim(),
                (row['地址'] || '').toString().trim(),
                existing.id
              ]
            );
            imported++;
            continue;
          } else {
            errors.push(`第 ${index + 2} 行：供应商「${name}」已存在，已跳过`);
            skipped++;
            continue;
          }
        }

        const existingCode = await req.db.get('SELECT id, is_deleted FROM suppliers WHERE code = ?', [code]);
        if (existingCode) {
          if (existingCode.is_deleted === 1) {
            // 同样如果编码对应的是已被软删除的供应商，更新并激活还原
            await req.db.run(
              `UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, is_deleted = 0, status = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [
                name,
                (row['联系人'] || '').toString().trim(),
                (row['联系电话'] || '').toString().trim(),
                (row['邮箱'] || '').toString().trim(),
                (row['地址'] || '').toString().trim(),
                existingCode.id
              ]
            );
            imported++;
            continue;
          } else {
            errors.push(`第 ${index + 2} 行：生成编码「${code}」已存在，已跳过`);
            skipped++;
            continue;
          }
        }

        await req.db.run(
          `INSERT INTO suppliers (code, name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)`,
          [code, name,
            (row['联系人'] || '').toString().trim(),
            (row['联系电话'] || '').toString().trim(),
            (row['邮箱'] || '').toString().trim(),
            (row['地址'] || '').toString().trim()
          ]
        );
        imported++;
      }
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
router.post('/customers', requirePermission('basic_data_create'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
    const rows = await parseExcel(req.file.buffer);
    if (rows.length === 0) return res.status(400).json({ success: false, message: '文件为空或格式不正确' });

    let imported = 0, skipped = 0, errors = [];

    await req.db.transaction(async () => {
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const code = (row['客户编码*'] || row['客户编码'] || '').toString().trim();
        const name = (row['客户名称*'] || row['客户名称'] || '').toString().trim();
        if (!code || !name) { errors.push(`第 ${index + 2} 行：编码或名称为空，已跳过`); skipped++; continue; }

        const existing = await req.db.get('SELECT id, is_deleted FROM customers WHERE code = ? OR name = ?', [code, name]);
        if (existing) {
          if (existing.is_deleted === 1) {
            // 被软删除的客户，覆盖更新并激活还原
            await req.db.run(
              `UPDATE customers SET name = ?, code = ?, contact_person = ?, phone = ?, email = ?, address = ?, credit_level = ?, is_deleted = 0, status = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              [
                name,
                code,
                (row['联系人'] || '').toString().trim(),
                (row['联系电话'] || '').toString().trim(),
                (row['邮箱'] || '').toString().trim(),
                (row['地址'] || '').toString().trim(),
                (row['信用等级(A/B/C)'] || row['信用等级'] || '').toString().trim() || null,
                existing.id
              ]
            );
            imported++;
            continue;
          } else {
            errors.push(`第 ${index + 2} 行：「${code} ${name}」已存在，已跳过`);
            skipped++;
            continue;
          }
        }

        await req.db.run(
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
      }
    });

    writeLog(req.db, req.user?.id, '批量导入客户', 'customer', null, `导入 ${imported} 条，跳过 ${skipped} 条`);
    res.json({ success: true, data: { imported, skipped, total: rows.length, errors } });
  } catch (error) {
    console.error('[import/customers]', error.message);
    res.status(500).json({ success: false, message: '服务器错误: ' + error.message });
  }
});

// 辅助函数：生成新产品编码
const getNextProductCode = async (db, prefix) => {
  const row = await db.get(
    "SELECT code FROM products WHERE code LIKE ? AND code NOT LIKE '%-%' ORDER BY code DESC LIMIT 1",
    [`${prefix}%`]
  );
  if (!row || !row.code) {
    return `${prefix}0001`;
  }
  const match = row.code.match(/\d+/);
  if (!match) {
    return `${prefix}0001`;
  }
  const numStr = match[0];
  const nextNum = parseInt(numStr, 10) + 1;
  return `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
};

// 辅助函数：生成新供应商编码
const getNextSupplierCode = async (db, prefix) => {
  const row = await db.get(
    "SELECT code FROM suppliers WHERE code LIKE ? ORDER BY id DESC LIMIT 1",
    [`${prefix}%`]
  );
  if (!row || !row.code) {
    return `${prefix}0001`;
  }
  const match = row.code.match(/\d+/);
  if (!match) {
    return `${prefix}0001`;
  }
  const numStr = match[0];
  const nextNum = parseInt(numStr, 10) + 1;
  return `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
};

// 辅助函数：获取供应商名称拼音首字母编码（带防冲突递增）
const generateSupplierInitialsCode = async (db, name) => {
  if (!name) return 'SUP';
  let baseCode = pinyin(name, { pattern: 'initial', toneType: 'none', type: 'array' })
    .map(x => x.toUpperCase())
    .join('');
  
  if (!baseCode || !/^[A-Z]+$/.test(baseCode)) {
    baseCode = 'SUP';
  }
  
  const MAX_SUFFIX = 999;
  let code = baseCode;
  let suffix = 2;
  while (suffix <= MAX_SUFFIX) {
    const existingCode = await db.get('SELECT id FROM suppliers WHERE code = ? AND name != ?', [code, name]);
    if (!existingCode) {
      return code;
    }
    code = `${baseCode}${suffix}`;
    suffix++;
  }
  throw new Error(`供应商编码 ${baseCode} 冲突次数超过上限(${MAX_SUFFIX})，请手动指定编码`);
};

/**
 * 导入 WPS 原材料库存
 * POST /wps-raw-materials
 */
router.post('/wps-raw-materials', requirePermission('warehouse_inbound'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });
    const rows = await parseExcel(req.file.buffer);
    if (rows.length === 0) return res.status(400).json({ success: false, message: '文件为空或格式不正确' });

    let imported = 0, skipped = 0, createdProducts = 0, createdSuppliers = 0, errors = [];

    // 确保有“原材料仓”
    let warehouse = await req.db.get("SELECT id FROM warehouses WHERE name LIKE '%原材料%' LIMIT 1");
    let warehouseId;
    if (warehouse) {
      warehouseId = warehouse.id;
    } else {
      const insWh = await req.db.run(
        "INSERT INTO warehouses (name, code, type, status) VALUES ('原材料仓', 'YCC01', 'raw', 1)"
      );
      warehouseId = insWh.lastInsertRowid;
    }

    await req.db.transaction(async () => {
      const aggregatedItems = [];
      const aggregatedMap = new Map();

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const specStr = (row['原材料规格*'] || row['原材料规格'] || '').toString().trim();
        const qtyStr = (row['现有库存*'] || row['现有库存'] || '0').toString().trim();
        const supplierName = (row['供货单位'] || '').toString().trim();

        if (!specStr) {
          errors.push(`第 ${index + 2} 行：原材料规格为空，已跳过`);
          skipped++;
          continue;
        }

        // 1. 规格智能解析
        const parsed = parseSpecification(specStr);
        if (!parsed || parsed.outer_diameter === null) {
          errors.push(`第 ${index + 2} 行：规格「${specStr}」格式不符合规范或无法解析，已跳过`);
          skipped++;
          continue;
        }

        const qty = parseFloat(qtyStr) || 0;

        // 2. 匹配或新建供应商
        let supplierId = null;
        if (supplierName) {
          let sup = await req.db.get("SELECT id FROM suppliers WHERE name = ?", [supplierName]);
          if (!sup) {
            const nextCode = await generateSupplierInitialsCode(req.db, supplierName);
            const insSup = await req.db.run(
              "INSERT INTO suppliers (code, name, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
              [nextCode, supplierName]
            );
            supplierId = insSup.lastInsertRowid;
            createdSuppliers++;
          } else {
            supplierId = sup.id;
          }
        }

        // 3. 智能获取或创建钢种分类
        const matCatId = await getOrCreateMaterialCategory(req.db, parsed.rawSteelType);

        // 使用唯一的聚合键：物理属性 + 钢种分类ID + 供应商ID
        const key = `${parsed.outer_diameter}_${parsed.inner_diameter}_${parsed.wall_thickness}_${parsed.length}_${matCatId}_${supplierId || 0}`;

        if (aggregatedMap.has(key)) {
          const item = aggregatedMap.get(key);
          item.qty += qty;
        } else {
          const item = {
            parsed,
            qty,
            supplierId,
            matCatId
          };
          aggregatedMap.set(key, item);
          aggregatedItems.push(item);
        }
      }

      // 4. 对合并处理后的记录进行存盘和库存更新
      for (const item of aggregatedItems) {
        const { parsed, qty, supplierId, matCatId } = item;

        // 智能获取或创建产品档案 (products)
        // 方案 A（独立建档）：不同供应商要单独建立。因此匹配时，还要匹配 supplier_id 是否相同
        const queryParams = ['原材料', parsed.outer_diameter];
        let querySql = `SELECT id FROM products WHERE category = ? AND outer_diameter = ?`;

        if (parsed.inner_diameter !== null) {
          querySql += ` AND inner_diameter = ?`;
          queryParams.push(parsed.inner_diameter);
        } else {
          querySql += ` AND inner_diameter IS NULL`;
        }

        if (parsed.wall_thickness !== null) {
          querySql += ` AND wall_thickness = ?`;
          queryParams.push(parsed.wall_thickness);
        } else {
          querySql += ` AND wall_thickness IS NULL`;
        }

        if (parsed.length !== null) {
          querySql += ` AND length = ?`;
          queryParams.push(parsed.length);
        } else {
          querySql += ` AND length IS NULL`;
        }

        querySql += ` AND material_category_id = ?`;
        queryParams.push(matCatId);

        if (supplierId !== null) {
          querySql += ` AND supplier_id = ?`;
          queryParams.push(supplierId);
        } else {
          querySql += ` AND supplier_id IS NULL`;
        }

        let product = await req.db.get(querySql, queryParams);

        let productId;
        if (!product) {
          const nextCode = await getNextProductCode(req.db, 'YC');
          const specName = parsed.specName;
          const name = parsed.specName;

          const insProd = await req.db.run(`
            INSERT INTO products (
              code, name, specification, unit, category, outer_diameter, inner_diameter, wall_thickness, length,
              material_category_id, supplier_id, status, created_at, updated_at
            ) VALUES (?, ?, ?, '公斤', '原材料', ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `, [
            nextCode,
            name,
            specName,
            parsed.outer_diameter,
            parsed.inner_diameter,
            parsed.wall_thickness,
            parsed.length,
            matCatId,
            supplierId
          ]);
          productId = insProd.lastInsertRowid;
          createdProducts++;
        } else {
          productId = product.id;
          // 若之前为软删除状态，自动将其还原激活
          await req.db.run("UPDATE products SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [productId]);
        }

        // 自动建立并同步绑定产品-供应商多对多关联表
        if (productId && supplierId) {
          const relation = await req.db.get(
            "SELECT id FROM product_suppliers WHERE product_id = ? AND supplier_id = ?",
            [productId, supplierId]
          );
          if (!relation) {
            await req.db.run(
              "INSERT INTO product_suppliers (product_id, supplier_id) VALUES (?, ?)",
              [productId, supplierId]
            );
          }
        }

        // 覆盖系统内之前的库存值
        const roundedQty = Math.round(qty);
        const invRow = await req.db.get(
          "SELECT id FROM inventory WHERE product_id = ? AND warehouse_id = ? AND batch_no = '期初导入'",
          [productId, warehouseId]
        );
        if (invRow) {
          await req.db.run(
            "UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [roundedQty, invRow.id]
          );
        } else {
          await req.db.run(
            "INSERT INTO inventory (product_id, warehouse_id, quantity, batch_no, updated_at) VALUES (?, ?, ?, '期初导入', CURRENT_TIMESTAMP)",
            [productId, warehouseId, roundedQty]
          );
        }
        imported++;
      }
    });

    writeLog(req.db, req.user?.id, '批量导入WPS原材料库存', 'warehouse', null, `成功导入并对齐库存 ${imported} 条，新建物料 ${createdProducts} 个，新建供应商 ${createdSuppliers} 个，跳过 ${skipped} 条`);
    res.json({ success: true, data: { imported, skipped, createdProducts, createdSuppliers, total: rows.length, errors } });
  } catch (error) {
    console.error('[import/wps-raw-materials]', error.message);
    res.status(500).json({ success: false, message: '系统发生内部异常，无法继续执行该操作。失败原因: ' + error.message });
  }
});

/**
 * WPS 多维表格（轻维表）单条数据自动同步 Webhook 接口
 * POST /wps-webhook
 */
router.post('/wps-webhook', async (req, res) => {
  try {
    const body = req.body;
    console.log('[WPS Webhook] 收到数据:', body);

    const specStr = (body.spec || body.specification || body['原材料规格'] || '').toString().trim();
    const qtyStr = (body.qty || body.quantity || body['现有库存'] || '0').toString().trim();
    const supplierName = (body.supplier || body.supplier_name || body['供货单位'] || '').toString().trim();

    if (!specStr) {
      return res.status(400).json({ success: false, message: '同步失败：原材料规格（spec）为必填字段且不能为空' });
    }

    // 1. 规格智能解析
    const parsed = parseSpecification(specStr);
    if (!parsed || parsed.outer_diameter === null) {
      return res.status(400).json({ success: false, message: `同步失败：规格「${specStr}」格式不符合规范，无法解析` });
    }

    const qty = Math.round(parseFloat(qtyStr) || 0);

    // 确保有“原材料仓”
    let warehouse = await req.db.get("SELECT id FROM warehouses WHERE name LIKE '%原材料%' LIMIT 1");
    let warehouseId;
    if (warehouse) {
      warehouseId = warehouse.id;
    } else {
      const insWh = await req.db.run(
        "INSERT INTO warehouses (name, code, type, status) VALUES ('原材料仓', 'YCC01', 'raw', 1)"
      );
      warehouseId = insWh.lastInsertRowid;
    }

    let resultData = {};
    await req.db.transaction(async () => {
      // 2. 匹配或新建供应商
      let supplierId = null;
      if (supplierName) {
        let sup = await req.db.get("SELECT id FROM suppliers WHERE name = ?", [supplierName]);
        if (!sup) {
          const nextCode = await generateSupplierInitialsCode(req.db, supplierName);
          const insSup = await req.db.run(
            "INSERT INTO suppliers (code, name, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            [nextCode, supplierName]
          );
          supplierId = insSup.lastInsertRowid;
        } else {
          supplierId = sup.id;
        }
      }

      // 3. 智能获取或创建钢种分类（含大类级联判定）
      const matCatId = await getOrCreateMaterialCategory(req.db, parsed.rawSteelType);

      // 4. 匹配或自动建档产品档案 (products)
      const queryParams = ['原材料', parsed.outer_diameter];
      let querySql = `SELECT id FROM products WHERE category = ? AND outer_diameter = ?`;

      if (parsed.inner_diameter !== null) {
        querySql += ` AND inner_diameter = ?`;
        queryParams.push(parsed.inner_diameter);
      } else {
        querySql += ` AND inner_diameter IS NULL`;
      }

      if (parsed.wall_thickness !== null) {
        querySql += ` AND wall_thickness = ?`;
        queryParams.push(parsed.wall_thickness);
      } else {
        querySql += ` AND wall_thickness IS NULL`;
      }

      if (parsed.length !== null) {
        querySql += ` AND length = ?`;
        queryParams.push(parsed.length);
      } else {
        querySql += ` AND length IS NULL`;
      }

      querySql += ` AND material_category_id = ?`;
      queryParams.push(matCatId);

      if (supplierId !== null) {
        querySql += ` AND supplier_id = ?`;
        queryParams.push(supplierId);
      } else {
        querySql += ` AND supplier_id IS NULL`;
      }

      let product = await req.db.get(querySql, queryParams);

      let productId;
      if (!product) {
        const nextCode = await getNextProductCode(req.db, 'YC');
        const specName = parsed.specName;
        const name = parsed.specName; // 统一命名体系：name 与 specification 保持一致，直接由尺寸特征组成

        const insProd = await req.db.run(`
          INSERT INTO products (
            code, name, specification, unit, category, outer_diameter, inner_diameter, wall_thickness, length,
            material_category_id, supplier_id, status, created_at, updated_at
          ) VALUES (?, ?, ?, '公斤', '原材料', ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          nextCode,
          name,
          specName,
          parsed.outer_diameter,
          parsed.inner_diameter,
          parsed.wall_thickness,
          parsed.length,
          matCatId,
          supplierId
        ]);
        productId = insProd.lastInsertRowid;
      } else {
        productId = product.id;
        // 若之前为软删除状态，自动将其还原激活
        await req.db.run("UPDATE products SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [productId]);
      }

      // 自动建立并同步绑定产品-供应商多对多关联表
      if (productId && supplierId) {
        const relation = await req.db.get(
          "SELECT id FROM product_suppliers WHERE product_id = ? AND supplier_id = ?",
          [productId, supplierId]
        );
        if (!relation) {
          await req.db.run(
            "INSERT INTO product_suppliers (product_id, supplier_id) VALUES (?, ?)",
            [productId, supplierId]
          );
        }
      }

      // 5. 更新或插入现有库存 (inventory)
      const invRow = await req.db.get(
        "SELECT id FROM inventory WHERE product_id = ? AND warehouse_id = ? AND batch_no = '期初导入'",
        [productId, warehouseId]
      );
      if (invRow) {
        await req.db.run(
          "UPDATE inventory SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [qty, invRow.id]
        );
      } else {
        await req.db.run(
          "INSERT INTO inventory (product_id, warehouse_id, quantity, batch_no, updated_at) VALUES (?, ?, ?, '期初导入', CURRENT_TIMESTAMP)",
          [productId, warehouseId, qty]
        );
      }

      resultData = {
        productId,
        warehouseId,
        quantity: qty,
        specName: parsed.specName,
        steelType: parsed.rawSteelType,
        supplierId
      };
    });

    writeLog(req.db, null, 'WPS多维表格Webhook数据同步', 'warehouse', null, `成功同步库存条目: ${parsed.specName}, 数量: ${qty} kg`);
    res.json({ success: true, message: 'WPS多维表格数据同步成功', data: resultData });
  } catch (error) {
    console.error('[import/wps-webhook] error:', error.message);
    res.status(500).json({ success: false, message: '数据同步失败，错误: ' + error.message });
  }
});

module.exports = router;
