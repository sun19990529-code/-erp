/**
 * 全局通用数据格式化工具
 * @module utils/format
 */

/**
 * 将金额转为标准的带千分位及两/多位小数的格式 (如：1,234.00)
 * @param {number|string} value - 需要格式化的值
 * @param {number} decimals - 保留小数位数 (默认2位)
 * @returns {string} 格式化后的字符串
 */
export const formatAmount = (value, decimals = 2) => {
  const num = parseFloat(value);
  if (isNaN(num)) return '0.00';
  
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * 格式化重量/数量字段，带千分位但不强制保留末尾毫无意义的零
 * 例如： 12000.5 -> 12,000.5, 12000.0 -> 12,000
 * @param {number|string} value - 待格式化数字
 * @param {number} maxDecimals - 最大允许小数位(默认 3，对于超高精度工业)
 * @returns {string}
 */
export const formatQuantity = (value, maxDecimals = 3) => {
  const num = parseFloat(value);
  if (isNaN(num)) return '0';

  return num.toLocaleString('zh-CN', {
    maximumFractionDigits: maxDecimals
  });
};

/**
 * 构建带汇率或货币符的安全组合
 */
export const formatCurrency = (value, currencySymbol = '¥') => {
  return `${currencySymbol} ${formatAmount(value)}`;
};
