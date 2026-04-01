// 订单号生成工具 - 使用时间戳+自增序列防碰撞
let sequenceCounter = 0;
let lastTimestamp = '';

function generateOrderNo(prefix) {
  const now = new Date();
  // 使用本地时间（而非 UTC）生成日期部分，避免 UTC+8 时区 0:00~8:00 日期偏差
  const y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const dateStr = `${y}${M}${d}`;
  const timestamp = `${dateStr}${h}${m}${s}`;
  
  if (timestamp !== lastTimestamp) {
    sequenceCounter = 0;
    lastTimestamp = timestamp;
  }
  
  sequenceCounter++;
  const seq = sequenceCounter.toString().padStart(3, '0');
  return `${prefix}${timestamp}${seq}`;
}

module.exports = { generateOrderNo };
