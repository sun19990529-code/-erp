import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';

/**
 * 财务模块高精度计算测试
 * 验证 Decimal.js 替换 Math.round 后的付款/收款余额计算精度
 */

// 从 finance.js 提取的核心计算逻辑
function calcRemaining(amount, paidAmount) {
  return new Decimal(amount).minus(paidAmount).toNumber();
}

function calcNewPaid(currentPaid, payAmount) {
  return new Decimal(currentPaid).plus(payAmount).toNumber();
}

function isOverpay(payAmount, remaining) {
  return new Decimal(payAmount).gt(remaining);
}

function calcStatus(newPaid, totalAmount) {
  return newPaid >= totalAmount ? 'paid' : 'partial';
}

describe('财务 - 付款余额计算', () => {
  it('基本余额计算应精确', () => {
    expect(calcRemaining(1000, 300)).toBe(700);
    expect(calcRemaining(999.99, 0)).toBe(999.99);
    expect(calcRemaining(100, 100)).toBe(0);
  });

  it('连续多笔小额付款累加不应产生浮点漂移', () => {
    // 这是 Math.round 最容易出错的经典场景：0.1 + 0.2 ≠ 0.3
    let paid = 0;
    for (let i = 0; i < 10; i++) {
      paid = calcNewPaid(paid, 0.1);
    }
    // 原生 JS: 0.1 * 10 = 0.9999999999999999
    // Decimal: 精确等于 1.0
    expect(paid).toBe(1);
  });

  it('大金额 + 小数分数累加应精确', () => {
    let paid = 0;
    // 模拟 3 笔付款：33333.33 + 33333.33 + 33333.34 = 100000
    paid = calcNewPaid(paid, 33333.33);
    paid = calcNewPaid(paid, 33333.33);
    paid = calcNewPaid(paid, 33333.34);
    expect(paid).toBe(100000);
  });

  it('余额为 0 时继续付款应被拒绝', () => {
    const remaining = calcRemaining(500, 500);
    expect(remaining).toBe(0);
    expect(isOverpay(0.01, remaining)).toBe(true);
  });

  it('付款金额恰好等于余额时不应判定为超付', () => {
    const remaining = calcRemaining(1000, 700.5);
    expect(isOverpay(299.5, remaining)).toBe(false);
  });

  it('付款金额超出余额 0.01 时应判定为超付', () => {
    const remaining = calcRemaining(100, 80);
    expect(isOverpay(20.01, remaining)).toBe(true);
  });
});

describe('财务 - 收款状态判定', () => {
  it('累计付款等于总额时应标记为 paid', () => {
    const newPaid = calcNewPaid(900, 100);
    expect(calcStatus(newPaid, 1000)).toBe('paid');
  });

  it('累计付款小于总额时应标记为 partial', () => {
    const newPaid = calcNewPaid(500, 100);
    expect(calcStatus(newPaid, 1000)).toBe('partial');
  });

  it('分 100 笔 ¥10 付清 ¥1000 应判定为 paid', () => {
    let paid = 0;
    for (let i = 0; i < 100; i++) {
      paid = calcNewPaid(paid, 10);
    }
    expect(paid).toBe(1000);
    expect(calcStatus(paid, 1000)).toBe('paid');
  });
});

describe('财务 - 浮点精度边界场景', () => {
  it('0.1 + 0.2 应精确等于 0.3', () => {
    const result = calcNewPaid(0.1, 0.2);
    expect(result).toBe(0.3);
  });

  it('经典银行家舍入场景：1000.005 - 999.995 应等于 0.01', () => {
    expect(calcRemaining(1000.005, 999.995)).toBe(0.01);
  });

  it('极小差值不应被吞掉', () => {
    const remaining = calcRemaining(100.01, 100);
    expect(remaining).toBe(0.01);
    expect(isOverpay(0.01, remaining)).toBe(false);
    expect(isOverpay(0.02, remaining)).toBe(true);
  });
});
