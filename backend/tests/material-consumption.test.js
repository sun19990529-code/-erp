import { describe, it, expect } from 'vitest';

/**
 * 阶段4新增功能测试 — 材质分类 + 材料消耗
 */

describe('材质分类树形组装', () => {
  // 模拟 buildTree 逻辑
  function buildTree(items, parentId = null) {
    return items
      .filter(i => i.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(i => ({ ...i, children: buildTree(items, i.id) }));
  }

  const flatCategories = [
    { id: 1, name: '不锈钢', parent_id: null, sort_order: 1 },
    { id: 2, name: '304', parent_id: 1, sort_order: 1 },
    { id: 3, name: '304L', parent_id: 1, sort_order: 2 },
    { id: 4, name: '316', parent_id: 1, sort_order: 3 },
    { id: 5, name: '铜材', parent_id: null, sort_order: 2 },
    { id: 6, name: 'T2 紫铜', parent_id: 5, sort_order: 1 },
  ];

  it('应正确组装两级树形结构', () => {
    const tree = buildTree(flatCategories);
    expect(tree).toHaveLength(2); // 不锈钢、铜材
    expect(tree[0].name).toBe('不锈钢');
    expect(tree[0].children).toHaveLength(3); // 304, 304L, 316
    expect(tree[1].name).toBe('铜材');
    expect(tree[1].children).toHaveLength(1); // T2 紫铜
  });

  it('子节点应按 sort_order 排序', () => {
    const tree = buildTree(flatCategories);
    const steelChildren = tree[0].children;
    expect(steelChildren[0].name).toBe('304');
    expect(steelChildren[1].name).toBe('304L');
    expect(steelChildren[2].name).toBe('316');
  });

  it('空数组应返回空树', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('无子节点的分类应有空 children 数组', () => {
    const tree = buildTree([{ id: 1, name: '单独分类', parent_id: null, sort_order: 1 }]);
    expect(tree[0].children).toEqual([]);
  });
});

describe('材料消耗量校验', () => {
  // 模拟 materialOverrides 解析逻辑
  function parseMaterialOverrides(materials) {
    const overrides = {};
    if (Array.isArray(materials)) {
      materials.forEach(m => {
        if (m.material_id && m.actual_quantity != null) {
          const val = parseFloat(m.actual_quantity);
          if (!isNaN(val) && val >= 0) {
            overrides[m.material_id] = val;
          }
        }
      });
    }
    return overrides;
  }

  it('合法实际用量应被正确解析', () => {
    const result = parseMaterialOverrides([
      { material_id: 1, actual_quantity: 15.5 },
      { material_id: 2, actual_quantity: 0.8 },
    ]);
    expect(result).toEqual({ 1: 15.5, 2: 0.8 });
  });

  it('负数用量应被忽略', () => {
    const result = parseMaterialOverrides([
      { material_id: 1, actual_quantity: -5 },
    ]);
    expect(result).toEqual({});
  });

  it('NaN 用量应被忽略', () => {
    const result = parseMaterialOverrides([
      { material_id: 1, actual_quantity: 'abc' },
    ]);
    expect(result).toEqual({});
  });

  it('零用量应被接受', () => {
    const result = parseMaterialOverrides([
      { material_id: 1, actual_quantity: 0 },
    ]);
    expect(result).toEqual({ 1: 0 });
  });

  it('空数组应返回空映射', () => {
    expect(parseMaterialOverrides([])).toEqual({});
  });

  it('undefined 应返回空映射', () => {
    expect(parseMaterialOverrides(undefined)).toEqual({});
  });

  it('缺少 material_id 的条目应被忽略', () => {
    const result = parseMaterialOverrides([
      { actual_quantity: 10 },
      { material_id: null, actual_quantity: 5 },
    ]);
    expect(result).toEqual({});
  });

  it('前端未填写(undefined actual_quantity)的条目应被忽略', () => {
    const result = parseMaterialOverrides([
      { material_id: 1, actual_quantity: undefined },
      { material_id: 2, actual_quantity: 10 },
    ]);
    expect(result).toEqual({ 2: 10 });
  });
});

describe('消耗量计算逻辑', () => {
  it('有 override 时应用实际值而非计划值', () => {
    const plannedQty = 0.5 * 30; // 15kg 计划
    const override = 16.2; // 实际 16.2kg
    const consumeQty = override !== undefined ? override : plannedQty;
    expect(consumeQty).toBe(16.2);
  });

  it('无 override 时应回退到计划值', () => {
    const plannedQty = 0.5 * 30; // 15kg 计划
    const override = undefined;
    const consumeQty = override !== undefined ? override : plannedQty;
    expect(consumeQty).toBe(15);
  });

  it('损耗率计算应正确', () => {
    const planned = 100;
    const actual = 92;
    const wasteRate = ((planned - actual) * 100.0 / planned).toFixed(1);
    expect(wasteRate).toBe('8.0');
  });

  it('完成量等于计划量时损耗率为0', () => {
    const planned = 100;
    const actual = 100;
    const wasteRate = ((planned - actual) * 100.0 / planned).toFixed(1);
    expect(wasteRate).toBe('0.0');
  });
});
