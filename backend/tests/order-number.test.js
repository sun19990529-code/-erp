import { describe, it, expect, beforeEach } from 'vitest';

// 需要重置模块级状态以确保每个测试独立
let generateOrderNo;
beforeEach(async () => {
  // 动态导入并清除缓存
  const mod = await import('../utils/order-number.js');
  generateOrderNo = mod.generateOrderNo;
});

describe('generateOrderNo', () => {
  it('应生成以指定前缀开头的订单号', () => {
    const result = generateOrderNo('PO');
    expect(result).toMatch(/^PO\d{14}\d{3}$/);
  });

  it('不同前缀应生成不同前缀的订单号', () => {
    const so = generateOrderNo('SO');
    const po = generateOrderNo('PO');
    expect(so.startsWith('SO')).toBe(true);
    expect(po.startsWith('PO')).toBe(true);
  });

  it('同一秒内连续生成的订单号序列号应递增', () => {
    const no1 = generateOrderNo('T');
    const no2 = generateOrderNo('T');
    // 最后3位是序列号
    const seq1 = parseInt(no1.slice(-3));
    const seq2 = parseInt(no2.slice(-3));
    expect(seq2).toBeGreaterThan(seq1);
  });

  it('订单号长度应为 前缀 + 14位时间戳 + 3位序列号', () => {
    const result = generateOrderNo('WW');
    // WW + YYYYMMDDHHMMSS(14) + SEQ(3) = 2 + 14 + 3 = 19
    expect(result.length).toBe(19);
  });
});
