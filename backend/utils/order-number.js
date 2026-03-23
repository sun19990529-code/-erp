// 订单号生成工具 - 使用时间戳+自增序列防碰撞
let sequenceCounter = 0;
let lastTimestamp = '';

function generateOrderNo(prefix) {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const timestamp = dateStr + date.getHours().toString().padStart(2, '0') + date.getMinutes().toString().padStart(2, '0') + date.getSeconds().toString().padStart(2, '0');
  
  if (timestamp !== lastTimestamp) {
    sequenceCounter = 0;
    lastTimestamp = timestamp;
  }
  
  sequenceCounter++;
  const seq = sequenceCounter.toString().padStart(3, '0');
  return `${prefix}${dateStr}${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}${seq}`;
}

module.exports = { generateOrderNo };
