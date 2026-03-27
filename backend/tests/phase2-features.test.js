import { describe, it, expect } from 'vitest';

/**
 * 第二阶段新增功能 — 业务逻辑单元测试
 * 覆盖：采购建议算法、成本计算逻辑、参数校验
 */

// ==================== 采购建议算法 ====================

describe('采购建议算法', () => {

  /**
   * 核心计算函数（从 purchase.js suggestions API 中提取的纯逻辑）
   */
  function calcSuggestion({ currentStock, orderGap, inTransit, minStock, maxStock, threshold = 'both' }) {
    const safetyGap = minStock > 0 ? Math.max(0, minStock - currentStock - inTransit) : 0;
    const netOrderGap = orderGap > 0 ? Math.max(0, orderGap - currentStock - inTransit) : 0;

    let needPurchase = false;
    if (threshold === 'safety') needPurchase = safetyGap > 0;
    else if (threshold === 'order') needPurchase = netOrderGap > 0;
    else needPurchase = safetyGap > 0 || netOrderGap > 0;

    if (!needPurchase) return null;

    let suggestedQty = Math.max(safetyGap, netOrderGap);
    if (maxStock > 0 && (currentStock + inTransit + suggestedQty) < maxStock) {
      suggestedQty = maxStock - currentStock - inTransit;
    }
    suggestedQty = Math.max(suggestedQty, 1);

    return { safetyGap, netOrderGap, suggestedQty, needPurchase };
  }

  describe('安全库存缺口', () => {
    it('库存低于安全库存时应产生缺口', () => {
      const r = calcSuggestion({ currentStock: 30, orderGap: 0, inTransit: 0, minStock: 100, maxStock: 0 });
      expect(r).not.toBeNull();
      expect(r.safetyGap).toBe(70);
    });

    it('在途采购应抵消安全库存缺口', () => {
      const r = calcSuggestion({ currentStock: 30, orderGap: 0, inTransit: 50, minStock: 100, maxStock: 0 });
      expect(r).not.toBeNull();
      expect(r.safetyGap).toBe(20); // 100 - 30 - 50 = 20
    });

    it('库存+在途 >= 安全库存时无缺口', () => {
      const r = calcSuggestion({ currentStock: 60, orderGap: 0, inTransit: 50, minStock: 100, maxStock: 0 });
      expect(r).toBeNull();
    });

    it('未设置安全库存时无安全缺口', () => {
      const r = calcSuggestion({ currentStock: 0, orderGap: 0, inTransit: 0, minStock: 0, maxStock: 0 });
      expect(r).toBeNull();
    });
  });

  describe('订单需求缺口', () => {
    it('订单需求大于库存+在途时应产生缺口', () => {
      const r = calcSuggestion({ currentStock: 20, orderGap: 100, inTransit: 10, minStock: 0, maxStock: 0 });
      expect(r).not.toBeNull();
      expect(r.netOrderGap).toBe(70); // 100 - 20 - 10
    });

    it('库存+在途已足够覆盖订单需求时无缺口', () => {
      const r = calcSuggestion({ currentStock: 80, orderGap: 50, inTransit: 0, minStock: 0, maxStock: 0 });
      expect(r).toBeNull();
    });
  });

  describe('建议采购量', () => {
    it('应取安全缺口和订单缺口的较大值', () => {
      const r = calcSuggestion({ currentStock: 10, orderGap: 50, inTransit: 0, minStock: 100, maxStock: 0 });
      // safetyGap = 90, netOrderGap = 40
      expect(r.suggestedQty).toBe(90);
    });

    it('有 maxStock 时应补到上限', () => {
      const r = calcSuggestion({ currentStock: 10, orderGap: 30, inTransit: 0, minStock: 50, maxStock: 200 });
      // safetyGap = 40, netOrderGap = 20, suggested = max(40,20)=40
      // 但 10 + 0 + 40 = 50 < 200, 所以 suggested = 200 - 10 - 0 = 190
      expect(r.suggestedQty).toBe(190);
    });

    it('建议量最小为 1', () => {
      const r = calcSuggestion({ currentStock: 99, orderGap: 0, inTransit: 0, minStock: 100, maxStock: 0 });
      expect(r.suggestedQty).toBeGreaterThanOrEqual(1);
    });
  });

  describe('过滤阈值', () => {
    it('threshold=safety 只看安全库存', () => {
      // 有订单缺口但无安全缺口
      const r = calcSuggestion({ currentStock: 100, orderGap: 200, inTransit: 0, minStock: 50, maxStock: 0, threshold: 'safety' });
      expect(r).toBeNull(); // 安全库存 50 < 现有 100，无安全缺口
    });

    it('threshold=order 只看订单缺口', () => {
      // 有安全缺口但无订单缺口
      const r = calcSuggestion({ currentStock: 10, orderGap: 0, inTransit: 0, minStock: 100, maxStock: 0, threshold: 'order' });
      expect(r).toBeNull();
    });
  });
});

// ==================== 紧急度判定 ====================

describe('紧急度判定', () => {

  function calcUrgency(currentStock, minStock, orderGap, safetyGap) {
    if (currentStock === 0 && orderGap > 0) return 'critical';
    if (currentStock < minStock * 0.5 && orderGap > 0) return 'high';
    if (safetyGap > 0) return 'medium';
    return 'normal';
  }

  it('零库存+有订单需求 → critical', () => {
    expect(calcUrgency(0, 100, 50, 100)).toBe('critical');
  });

  it('库存不足安全库存50%+有订单 → high', () => {
    expect(calcUrgency(40, 100, 50, 60)).toBe('high');
  });

  it('仅安全库存不足 → medium', () => {
    expect(calcUrgency(80, 100, 0, 20)).toBe('medium');
  });

  it('库存充足 → normal', () => {
    expect(calcUrgency(200, 100, 0, 0)).toBe('normal');
  });
});

// ==================== 成本计算逻辑 ====================

describe('工单成本计算', () => {

  function calcCost({ materialItems, outsourcingItems, completedQty, sellingPrice }) {
    const materialCost = materialItems.reduce((s, m) => s + m.quantity * m.unitPrice, 0);
    const outsourcingCost = outsourcingItems.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const totalCost = materialCost + outsourcingCost;
    const unitCost = completedQty > 0 ? parseFloat((totalCost / completedQty).toFixed(2)) : 0;
    const revenue = completedQty * sellingPrice;
    const profit = revenue - totalCost;
    const profitRate = revenue > 0 ? parseFloat((profit / revenue * 100).toFixed(1)) : 0;
    return { materialCost, outsourcingCost, totalCost, unitCost, revenue, profit, profitRate };
  }

  it('基本成本计算', () => {
    const r = calcCost({
      materialItems: [
        { quantity: 10, unitPrice: 5 },   // 50
        { quantity: 20, unitPrice: 3 },   // 60
      ],
      outsourcingItems: [{ totalAmount: 100 }],
      completedQty: 10,
      sellingPrice: 50,
    });
    expect(r.materialCost).toBe(110);
    expect(r.outsourcingCost).toBe(100);
    expect(r.totalCost).toBe(210);
    expect(r.unitCost).toBe(21);
    expect(r.revenue).toBe(500);
    expect(r.profit).toBe(290);
    expect(r.profitRate).toBe(58);
  });

  it('零完成量时单位成本为 0', () => {
    const r = calcCost({
      materialItems: [{ quantity: 10, unitPrice: 5 }],
      outsourcingItems: [],
      completedQty: 0,
      sellingPrice: 50,
    });
    expect(r.unitCost).toBe(0);
    expect(r.profitRate).toBe(0);
  });

  it('无物料无委外成本时利润率 100%', () => {
    const r = calcCost({
      materialItems: [],
      outsourcingItems: [],
      completedQty: 10,
      sellingPrice: 50,
    });
    expect(r.totalCost).toBe(0);
    expect(r.profit).toBe(500);
    expect(r.profitRate).toBe(100);
  });

  it('成本超过产值时利润率为负', () => {
    const r = calcCost({
      materialItems: [{ quantity: 100, unitPrice: 10 }], // 1000
      outsourcingItems: [],
      completedQty: 10,
      sellingPrice: 50, // revenue = 500
    });
    expect(r.profit).toBe(-500);
    expect(r.profitRate).toBe(-100);
  });

  it('售价为 0 时利润率为 0', () => {
    const r = calcCost({
      materialItems: [{ quantity: 10, unitPrice: 5 }],
      outsourcingItems: [],
      completedQty: 10,
      sellingPrice: 0,
    });
    expect(r.profitRate).toBe(0);
  });
});

// ==================== 采购单生成参数校验 ====================

describe('采购单生成参数校验', () => {

  function validateCreateOrder({ supplier_id, items }) {
    const errors = [];
    if (!supplier_id) errors.push('请选择供应商');
    if (!items || items.length === 0) errors.push('请至少选择一项物料');
    if (items?.some(i => !i.product_id)) errors.push('物料 ID 不能为空');
    if (items?.some(i => !i.quantity || i.quantity <= 0)) errors.push('数量必须大于 0');
    return errors;
  }

  it('合法参数无错误', () => {
    const errors = validateCreateOrder({
      supplier_id: 1,
      items: [{ product_id: 1, quantity: 10, unit_price: 5 }],
    });
    expect(errors).toHaveLength(0);
  });

  it('缺少供应商应报错', () => {
    const errors = validateCreateOrder({
      supplier_id: null,
      items: [{ product_id: 1, quantity: 10 }],
    });
    expect(errors).toContain('请选择供应商');
  });

  it('空物料列表应报错', () => {
    const errors = validateCreateOrder({ supplier_id: 1, items: [] });
    expect(errors).toContain('请至少选择一项物料');
  });

  it('数量为 0 应报错', () => {
    const errors = validateCreateOrder({
      supplier_id: 1,
      items: [{ product_id: 1, quantity: 0 }],
    });
    expect(errors).toContain('数量必须大于 0');
  });

  it('items 为 null/undefined 应报错', () => {
    expect(validateCreateOrder({ supplier_id: 1, items: null })).toContain('请至少选择一项物料');
    expect(validateCreateOrder({ supplier_id: 1, items: undefined })).toContain('请至少选择一项物料');
  });
});

// ==================== 导出工具逻辑 ====================

describe('导出列定义', () => {

  it('函数式 key 应正确取值', () => {
    const col = { header: '供应商', key: r => r.default_supplier?.name || '未绑定' };
    expect(col.key({ default_supplier: { name: '测试供应商' } })).toBe('测试供应商');
    expect(col.key({ default_supplier: null })).toBe('未绑定');
    expect(col.key({})).toBe('未绑定');
  });

  it('字符串 key 应正确取值', () => {
    const col = { header: '名称', key: 'product_name' };
    const value = typeof col.key === 'function' ? col.key({ product_name: 'A' }) : { product_name: 'A' }[col.key];
    expect(value).toBe('A');
  });

  it('null/undefined 值应返回空字符串', () => {
    const getValue = (row, col) => {
      const v = typeof col.key === 'function' ? col.key(row) : row[col.key];
      return v ?? '';
    };
    expect(getValue({}, { key: 'missing_field' })).toBe('');
    expect(getValue({ a: null }, { key: 'a' })).toBe('');
  });
});
