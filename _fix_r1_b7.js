/**
 * 批量修复 R1 和 B7：
 * R1: 所有 catch 块添加 console.error
 * B7: 在关键写操作中启用 writeLog
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'backend/routes');

// R1: 批量为所有路由文件的 catch 块添加 console.error
const routeFiles = ['orders.js', 'production.js', 'warehouse.js', 'purchase.js', 'outsourcing.js', 'inspection.js', 'pick.js', 'products.js', 'basic.js', 'dashboard.js'];

let totalFixed = 0;
routeFiles.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 匹配 catch 块中没有 console.error 的情况
  const pattern = /} catch \(error\) \{\n(\s+)((?!console\.error))/g;
  const replacement = `} catch (error) {\n$1console.error(\`[${file}]\`, error.message);\n$1`;
  
  const before = content;
  content = content.replace(pattern, replacement);
  
  if (content !== before) {
    const count = (content.match(/console\.error\(\`\[/g) || []).length;
    console.log(`[R1] ${file}: added console.error (${count} catch blocks)`);
    totalFixed++;
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
});

console.log(`\nR1 complete: ${totalFixed} files updated`);

// B7: 在关键路由文件中引入 writeLog
// 先检查哪些文件需要添加 writeLog 引入
const logTargets = ['orders.js', 'production.js', 'warehouse.js', 'purchase.js', 'outsourcing.js'];
logTargets.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('writeLog')) {
    // 在 require 区域末尾添加 writeLog 引入
    content = content.replace(
      "const { requirePermission } = require('../middleware/permission');",
      "const { requirePermission } = require('../middleware/permission');\nconst { writeLog } = require('./logs');"
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[B7] ${file}: added writeLog import`);
  }
});

console.log('\nB7 imports complete');
