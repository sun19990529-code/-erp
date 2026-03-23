import { describe, it, expect } from 'vitest';
import { convertToKg, convertFromKg } from '../utils/unit-convert.js';

describe('convertToKg', () => {
  it('公斤单位应直接返回原值', () => {
    expect(convertToKg(100, '公斤')).toBe(100);
  });

  it('吨转换为公斤应乘以 1000', () => {
    expect(convertToKg(1, '吨')).toBe(1000);
    expect(convertToKg(2.5, '吨')).toBe(2500);
  });

  it('支转换应使用产品尺寸公式计算', () => {
    const productInfo = { outer_diameter: '89', wall_thickness: '4', length: '6' };
    const result = convertToKg(10, '支', productInfo);
    // 公式：((89-4)*4)*0.02491*6 = 85*4*0.02491*6 = 50.8764
    // 10支 = 508.764
    const expectedPerPiece = ((89 - 4) * 4) * 0.02491 * 6;
    expect(result).toBeCloseTo(10 * expectedPerPiece, 4);
  });

  it('支转换缺少产品信息时应返回原值', () => {
    expect(convertToKg(10, '支')).toBe(10);
    expect(convertToKg(10, '支', null)).toBe(10);
    expect(convertToKg(10, '支', {})).toBe(10);
  });

  it('未知单位应返回原值', () => {
    expect(convertToKg(100, '米')).toBe(100);
    expect(convertToKg(50, '')).toBe(50);
  });
});

describe('convertFromKg', () => {
  it('公斤转公斤应返回原值', () => {
    expect(convertFromKg(100, '公斤')).toBe(100);
  });

  it('公斤转吨应除以 1000', () => {
    expect(convertFromKg(1000, '吨')).toBe(1);
    expect(convertFromKg(2500, '吨')).toBe(2.5);
  });

  it('公斤转支应使用产品尺寸公式逆计算', () => {
    const productInfo = { outer_diameter: '89', wall_thickness: '4', length: '6' };
    const kgPerPiece = ((89 - 4) * 4) * 0.02491 * 6;
    const result = convertFromKg(kgPerPiece * 5, '支', productInfo);
    expect(result).toBeCloseTo(5, 4);
  });

  it('convertToKg 和 convertFromKg 应互为逆运算', () => {
    const productInfo = { outer_diameter: '114', wall_thickness: '5', length: '12' };
    const originalQty = 20;
    const kg = convertToKg(originalQty, '支', productInfo);
    const backToQty = convertFromKg(kg, '支', productInfo);
    expect(backToQty).toBeCloseTo(originalQty, 4);
  });
});
