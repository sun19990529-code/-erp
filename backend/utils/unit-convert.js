// 单位转换函数：将输入数量转换为公斤
// 公式：((外径-壁厚)*壁厚)*0.02491*长度=单支公斤
const Decimal = require('decimal.js');

function convertToKg(quantity, unit, productInfo = null) {
  if (unit === '吨') {
    return new Decimal(quantity).times(1000).toNumber();
  }
  if (unit === '支') {
    if (productInfo && productInfo.outer_diameter && productInfo.wall_thickness && productInfo.length) {
      const od = new Decimal(productInfo.outer_diameter);
      const wt = new Decimal(productInfo.wall_thickness);
      const len = new Decimal(productInfo.length);
      const kgPerPiece = od.minus(wt).times(wt).times('0.02491').times(len);
      return new Decimal(quantity).times(kgPerPiece).toNumber();
    }
    console.warn('缺少产品尺寸信息，无法计算"支"转"公斤"');
    return quantity;
  }
  return quantity;
}

// 单位转换函数：将公斤转换为指定单位
function convertFromKg(quantityKg, unit, productInfo = null) {
  if (unit === '吨') {
    return new Decimal(quantityKg).div(1000).toNumber();
  }
  if (unit === '支') {
    if (productInfo && productInfo.outer_diameter && productInfo.wall_thickness && productInfo.length) {
      const od = new Decimal(productInfo.outer_diameter);
      const wt = new Decimal(productInfo.wall_thickness);
      const len = new Decimal(productInfo.length);
      const kgPerPiece = od.minus(wt).times(wt).times('0.02491').times(len);
      if (kgPerPiece.gt(0)) {
        return new Decimal(quantityKg).div(kgPerPiece).toNumber();
      }
    }
    console.warn('缺少产品尺寸信息，无法计算"公斤"转"支"');
    return quantityKg;
  }
  return quantityKg;
}

module.exports = { convertToKg, convertFromKg };
