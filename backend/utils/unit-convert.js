// 单位转换函数：将输入数量转换为公斤
// 公式：((外径-壁厚)*壁厚)*0.02491*长度=单支公斤
function convertToKg(quantity, unit, productInfo = null) {
  if (unit === '吨') {
    return quantity * 1000;
  }
  if (unit === '支') {
    if (productInfo && productInfo.outer_diameter && productInfo.wall_thickness && productInfo.length) {
      const outerDiameter = parseFloat(productInfo.outer_diameter) || 0;
      const wallThickness = parseFloat(productInfo.wall_thickness) || 0;
      const length = parseFloat(productInfo.length) || 0;
      const kgPerPiece = ((outerDiameter - wallThickness) * wallThickness) * 0.02491 * length;
      return quantity * kgPerPiece;
    }
    console.warn('缺少产品尺寸信息，无法计算"支"转"公斤"');
    return quantity;
  }
  return quantity;
}

// 单位转换函数：将公斤转换为指定单位
function convertFromKg(quantityKg, unit, productInfo = null) {
  if (unit === '吨') {
    return quantityKg / 1000;
  }
  if (unit === '支') {
    if (productInfo && productInfo.outer_diameter && productInfo.wall_thickness && productInfo.length) {
      const outerDiameter = parseFloat(productInfo.outer_diameter) || 0;
      const wallThickness = parseFloat(productInfo.wall_thickness) || 0;
      const length = parseFloat(productInfo.length) || 0;
      const kgPerPiece = ((outerDiameter - wallThickness) * wallThickness) * 0.02491 * length;
      if (kgPerPiece > 0) {
        return quantityKg / kgPerPiece;
      }
    }
    console.warn('缺少产品尺寸信息，无法计算"公斤"转"支"');
    return quantityKg;
  }
  return quantityKg;
}

module.exports = { convertToKg, convertFromKg };
