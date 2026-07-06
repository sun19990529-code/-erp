/**
 * 规格智能解析与统一命名引擎
 * @param {string} specStr 
 * @returns {object} 解析结果
 */
function parseSpecification(specStr) {
  if (!specStr) return null;
  let raw = specStr.toString().trim();
  
  // 1. 预处理，剔除所有的 Φ/φ/δ，替换中文括号为英文括号
  raw = raw.replace(/[Φφδ]/g, '').replace(/（/g, '(').replace(/）/g, ')');
  
  // 2. 提取材质与无缝判定
  let steelType = '304'; // 默认值
  let isSeamless = false;
  let dimensionsPart = raw;

  const dashIndex = raw.lastIndexOf('-');
  if (dashIndex !== -1) {
    dimensionsPart = raw.substring(0, dashIndex).trim();
    let originalSteel = raw.substring(dashIndex + 1).trim();
    
    // a. 先剔除材质末尾的括号状态符，如 (Y), (Z)
    originalSteel = originalSteel.replace(/\([a-zA-Z0-9\-_]+\)$/, '').trim();
    
    // b. 剔除末尾可能直接贴着的单字母状态代号，如 Y, Z （例如 316L无缝管Z -> 316L无缝管）
    if (/[YZ]$/i.test(originalSteel)) {
      const temp = originalSteel.substring(0, originalSteel.length - 1).trim();
      if (/(无缝管|无缝|无|304|316|321|316L|304L)$/i.test(temp)) {
        originalSteel = temp;
      }
    }
    
    // c. 无缝判定并生成规范大类材质名
    if (/(无缝管|无缝|无)$/.test(originalSteel)) {
      isSeamless = true;
      let coreSteel = originalSteel.replace(/(无缝管|无缝|无)$/, '').trim();
      steelType = coreSteel + '无缝';
    } else {
      isSeamless = false;
      steelType = originalSteel;
    }
  } else {
    if (/(无缝管|无缝|无)$/.test(raw)) {
      isSeamless = true;
      dimensionsPart = raw.replace(/(无缝管|无缝|无)$/, '').trim();
      steelType = '304无缝';
    }
  }

  // 3. 提取状态后缀如 (Y), (Z), 并从 dimensionsPart 中剥离出纯尺寸
  let statusSuffix = '';
  const statusMatch = dimensionsPart.match(/\([a-zA-Z0-9\-_]+\)$/);
  if (statusMatch) {
    statusSuffix = statusMatch[0];
    dimensionsPart = dimensionsPart.substring(0, dimensionsPart.length - statusSuffix.length).trim();
  }

  // 4. 解析数字列表
  const parts = dimensionsPart.split(/[*xX]/).map(p => p.trim()).filter(Boolean);
  
  let num1 = null, num2 = null, num3 = null;
  if (parts[0]) { const v = parseFloat(parts[0]); num1 = isNaN(v) ? null : v; }
  if (parts[1]) { const v = parseFloat(parts[1]); num2 = isNaN(v) ? null : v; }
  if (parts[2]) { const v = parseFloat(parts[2]); num3 = isNaN(v) ? null : v; }

  // 判定并设定数据结构
  let isSteelStrip = false;
  let outer_diameter = null;
  let inner_diameter = null;
  let wall_thickness = null;
  let length = null;
  let specName = '';

  if (num1 !== null && num2 !== null) {
    if (num1 < num2) {
      // 钢带：厚度*宽度
      isSteelStrip = true;
      outer_diameter = num1;
      wall_thickness = num2;
      inner_diameter = null;
      length = num3;
      
      specName = `钢带${num1}*${num2}`;
      if (length) specName += `*${length}`;
    } else if (num2 > num1 * 0.5) {
      // 外径*内径管：OD * ID，壁厚 = (OD - ID) / 2
      outer_diameter = num1;
      inner_diameter = num2;
      wall_thickness = parseFloat(((num1 - num2) / 2).toFixed(4));
      length = num3;
      
      specName = `Φ${num1}*Φ${num2}`;
      if (length) specName += `*${length}`;
      if (isSeamless) specName += '无缝';
    } else {
      // 外径*壁厚管：OD * WT
      outer_diameter = num1;
      wall_thickness = num2;
      inner_diameter = parseFloat((num1 - 2 * num2).toFixed(4));
      length = num3;
      
      specName = `Φ${num1}*δ${num2}`;
      if (length) specName += `*${length}`;
      if (isSeamless) specName += '无缝';
    }
  } else {
    specName = specStr;
  }

  return {
    rawSteelType: steelType,
    isSeamless,
    isSteelStrip,
    outer_diameter,
    inner_diameter,
    wall_thickness,
    length,
    statusSuffix,
    specName
  };
}

/**
 * 获取或创建材质分类（带大类级联判定）
 * @param {object} db 
 * @param {string} steelType 
 * @returns {Promise<number>} 分类ID
 */
async function getOrCreateMaterialCategory(db, steelType) {
  if (!steelType) return null;
  const name = steelType.trim();

  // 1. 匹配父类名称
  let parentName = '其他材料';
  const lowerName = name.toLowerCase();
  
  if (/(304|316|321|310|309|430|sus|cr|2205|2507|双相)/i.test(lowerName)) {
    parentName = '不锈钢';
  } else if (/(ni|镍|inconel|incoloy|monel|hastelloy|gh|600|625|800|825|2080|n52)/i.test(lowerName)) {
    parentName = '镍及镍合金';
  } else if (/(ti|ta|tc|tb|钛)/i.test(lowerName)) {
    parentName = '钛及钛合金';
  } else if (/(cu|铜|brass|紫铜|黄铜)/i.test(lowerName)) {
    parentName = '铜及铜合金';
  } else if (/(al|铝)/i.test(lowerName)) {
    parentName = '铝及铝合金';
  }

  // 2. 获取或创建父类
  let parentCat = await db.get("SELECT id FROM material_categories WHERE name = ? AND parent_id IS NULL LIMIT 1", [parentName]);
  let parentId;
  if (parentCat) {
    parentId = parentCat.id;
  } else {
    const insParent = await db.run(
      "INSERT INTO material_categories (name, parent_id, created_at) VALUES (?, NULL, CURRENT_TIMESTAMP)",
      [parentName]
    );
    parentId = insParent.lastInsertRowid;
  }

  // 3. 如果钢种本身就是父类名，直接返回 parentId
  if (name === parentName) {
    return parentId;
  }

  // 4. 获取或创建具体钢种
  let childCat = await db.get("SELECT id, parent_id FROM material_categories WHERE name = ? LIMIT 1", [name]);
  if (childCat) {
    if (childCat.parent_id !== parentId) {
      await db.run("UPDATE material_categories SET parent_id = ? WHERE id = ?", [parentId, childCat.id]);
    }
    return childCat.id;
  } else {
    const insChild = await db.run(
      "INSERT INTO material_categories (name, parent_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
      [name, parentId]
    );
    return insChild.lastInsertRowid;
  }
}

module.exports = {
  parseSpecification,
  getOrCreateMaterialCategory
};
