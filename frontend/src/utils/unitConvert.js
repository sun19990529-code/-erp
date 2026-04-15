/**
 * 钢管单位换算工具 — 全项目统一引用此文件
 * 公式：((外径 - 壁厚) × 壁厚) × 0.02491 × 长度 = 单支公斤
 */

export const STEEL_PIPE_FACTOR = 0.02491;

/**
 * 计算单支理论重量 (Kg/支)
 * @returns {number} 0 表示无法计算
 */
export function calcKgPerPiece(outerDiameter, wallThickness, length) {
  const od = parseFloat(outerDiameter) || 0;
  const wt = parseFloat(wallThickness) || 0;
  const l = parseFloat(length) || 0;
  if (od <= 0 || wt <= 0 || l <= 0) return 0;
  return ((od - wt) * wt) * STEEL_PIPE_FACTOR * l;
}

/**
 * 从产品/物料对象中提取尺寸并计算单支重量
 * @param {Object} productInfo - 需含 outer_diameter, wall_thickness, length
 */
export function calcKgPerPieceFromProduct(productInfo) {
  if (!productInfo) return 0;
  return calcKgPerPiece(productInfo.outer_diameter, productInfo.wall_thickness, productInfo.length);
}

/**
 * 将任意单位的数量转换为公斤
 * @param {number} quantity - 输入数量
 * @param {string} unit - 单位 ('公斤'|'吨'|'支')
 * @param {Object|null} productInfo - 产品信息（支转公斤时必需）
 * @returns {number} 等效公斤数。如果无法转换返回 0
 */
export function convertToKg(quantity, unit, productInfo = null) {
  if (unit === '吨') return quantity * 1000;
  if (unit === '支') {
    const kgPerPiece = calcKgPerPieceFromProduct(productInfo);
    if (kgPerPiece > 0) return quantity * kgPerPiece;
    return 0;
  }
  return quantity; // 公斤或其他单位直接返回
}

/**
 * 将公斤转换为指定单位
 * @param {number} kgQuantity - 公斤数
 * @param {string} unit - 目标单位
 * @param {Object|null} productInfo - 产品信息
 * @returns {number} 转换后的数量。如果无法转换返回 0
 */
export function convertFromKg(kgQuantity, unit, productInfo = null) {
  if (unit === '吨') return kgQuantity / 1000;
  if (unit === '支') {
    const kgPerPiece = calcKgPerPieceFromProduct(productInfo);
    if (kgPerPiece > 0) return kgQuantity / kgPerPiece;
    return 0;
  }
  return kgQuantity;
}
