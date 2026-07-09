import { describe, it, expect } from 'vitest';

// 1. 模拟钢带识别规则
function isSteelStrip(outerDiameter, wallThickness) {
  const od = parseFloat(outerDiameter) || 0;
  const wt = parseFloat(wallThickness) || 0;
  return od > 0 && wt > 0 && od < wt;
}

// 2. 模拟后端的 Excel 行合并规则
function aggregateExcelRows(rows) {
  const aggregatedMap = new Map();
  const aggregatedItems = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const specStr = row.specStr;
    const qty = parseFloat(row.qty) || 0;
    const supplierName = row.supplierName || '';

    // 智能解析规格（简易模拟）
    const parsed = {
      outer_diameter: parseFloat(specStr.match(/[\d.]+/g)[0]),
      wall_thickness: parseFloat(specStr.match(/[\d.]+/g)[1]),
      inner_diameter: null,
      length: specStr.match(/[\d.]+/g)[2] ? parseFloat(specStr.match(/[\d.]+/g)[2]) : null,
      rawSteelType: 'Ni52'
    };

    const matCatId = 1; // 假装是获取/创建的分类ID
    const supplierId = supplierName === '供应商A' ? 10 : (supplierName === '供应商B' ? 20 : null);

    const key = `${parsed.outer_diameter}_${parsed.inner_diameter}_${parsed.wall_thickness}_${parsed.length}_${matCatId}_${supplierId || 0}`;

    if (aggregatedMap.has(key)) {
      const item = aggregatedMap.get(key);
      item.qty += qty;
    } else {
      const item = {
        parsed,
        qty,
        supplierId,
        matCatId,
        specStr
      };
      aggregatedMap.set(key, item);
      aggregatedItems.push(item);
    }
  }

  return aggregatedItems;
}

describe('钢带智能检测逻辑', () => {
  it('厚度小于宽度（如外径比壁厚小）应被识别为钢带', () => {
    expect(isSteelStrip('0.42', '20.4')).toBe(true);
    expect(isSteelStrip(0.6, 18)).toBe(true);
  });

  it('普通圆管（如外径比壁厚大）不应被识别为钢带', () => {
    expect(isSteelStrip('19.3', '1.25')).toBe(false);
    expect(isSteelStrip(6.0, 0.55)).toBe(false);
  });
});

describe('WPS 导入 - 规格和供应商相同数据在内存中合并逻辑', () => {
  it('应当正确合并相同规格、相同供应商的行，并累加数量', () => {
    const rows = [
      { specStr: '0.42*20.4*6000', qty: 100, supplierName: '供应商A' },
      { specStr: '0.42*20.4*6000', qty: 200, supplierName: '供应商A' },
      { specStr: '0.42*20.4*6000', qty: 150, supplierName: '供应商B' }
    ];

    const result = aggregateExcelRows(rows);

    expect(result.length).toBe(2);

    const itemA = result.find(i => i.supplierId === 10);
    const itemB = result.find(i => i.supplierId === 20);

    expect(itemA).toBeDefined();
    expect(itemA.qty).toBe(300); // 100 + 200

    expect(itemB).toBeDefined();
    expect(itemB.qty).toBe(150);
  });
});
