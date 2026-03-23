/**
 * F3: 批量为关键操作添加 writeLog 调用
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'backend/routes');

// 定义需要添加日志的操作点: [文件, 搜索标记, 插入的日志代码]
const logPoints = [
  // orders.js
  ['orders.js', "res.json({ success: true, data: { id: orderId, order_no: orderNo } });", 
   "    writeLog(req.db, req.user?.id, '创建订单', 'orders', orderId, `订单号: ${orderNo}`);\n"],
  ['orders.js', "res.json({ success: true, message: '订单已删除' });",
   "    writeLog(req.db, req.user?.id, '删除订单', 'orders', req.params.id, `订单号: ${order.order_no}`);\n"],
  
  // production.js  
  ['production.js', "res.json({ success: true, data: { id: result.lastInsertRowid, order_no: orderNo } });",
   "    writeLog(req.db, req.user?.id, '创建生产工单', 'production', result.lastInsertRowid, `工单号: ${orderNo}`);\n"],
  
  // warehouse.js - 入库审核
  ['warehouse.js', "res.json({ success: true, message: '入库单状态已更新' });",
   "    writeLog(req.db, req.user?.id, '更新入库单状态', 'warehouse', req.params.id, `状态: ${status}`);\n"],
  
  // purchase.js - 采购创建
  ['purchase.js', "res.json({ success: true, data: { id: result.lastInsertRowid, order_no: orderNo } });",
   "    writeLog(req.db, req.user?.id, '创建采购单', 'purchase', result.lastInsertRowid, `采购单号: ${orderNo}`);\n"],
  
  // outsourcing.js
  ['outsourcing.js', "res.json({ success: true, data: { id: result.lastInsertRowid, order_no: orderNo } });",
   "    writeLog(req.db, req.user?.id, '创建委外单', 'outsourcing', result.lastInsertRowid, `委外单号: ${orderNo}`);\n"],
];

let count = 0;
for (const [file, marker, logCode] of logPoints) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes(marker) && !content.includes(logCode.trim())) {
    content = content.replace(marker, logCode + '    ' + marker);
    fs.writeFileSync(filePath, content, 'utf8');
    count++;
    console.log(`[ok] ${file}: added writeLog`);
  } else {
    console.log(`[skip] ${file}: marker not found or already applied`);
  }
}
console.log(`\nTotal: ${count} writeLog calls added`);
