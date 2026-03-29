const fs = require('fs');
const path = require('path');

// 从命令行拉取参数: node _bump.js <NEW_VER> ["DOC_DESC"] ["TABLE_DESC"]
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('用法: node _bump.js <NEW_VER> ["描述标题"] ["详细更新说明"]');
  console.error('例如: node _bump.js 1.7.0 "全局功能重构" "1. 重写API层 2. 优化性能"');
  process.exit(1);
}

const NEW_VER = args[0];
const UPDATE_DESC_DOC = args[1] || '常规体验优化与Bug修复';
const UPDATE_DESC_TABLE = args[2] || '进行例行维护与性能调优';

// 动态读取 VERSION 获取当前(旧)版本
let OLD_VER = '';
try {
  OLD_VER = fs.readFileSync('VERSION', 'utf8').trim();
} catch (e) {
  console.error('无法读取 VERSION 文件，请确认是否在项目根目录运行脚本。');
  process.exit(1);
}

if (!OLD_VER) {
  console.error('VERSION 文件为空。');
  process.exit(1);
}

if (OLD_VER === NEW_VER) {
  console.log(`当前版本已经是 ${NEW_VER}，无需升级。`);
  process.exit(0);
}

const UPDATE_DATE = new Date().toISOString().split('T')[0];
console.log(`>>> 准备从版本 ${OLD_VER} 升级到 ${NEW_VER}`);

// 安全正则替换辅助函数
const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OLD_VER_REGEX = escapeRegExp(OLD_VER);
const OLD_VER_NO_DOT = OLD_VER.replace(/\./g, '');
const NEW_VER_NO_DOT = NEW_VER.replace(/\./g, '');

// 1. VERSION
fs.writeFileSync('VERSION', NEW_VER);
console.log(`[OK] Updated VERSION file.`);

// 2. package.json files
const pkgFiles = ['backend/package.json', 'frontend/package.json'];
pkgFiles.forEach(f => {
  try {
    let content = fs.readFileSync(f, 'utf8');
    const pkg = JSON.parse(content);
    pkg.version = NEW_VER;
    fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`[OK] Updated ${f} (via JSON parser)`);
  } catch (e) {
    console.error(`[Error] 无法更新 ${f}:`, e.message);
  }
});

// 3. server-start.ps1
try {
  let ps1 = fs.readFileSync('server-start.ps1', 'utf8');
  ps1 = ps1.replace(new RegExp(`v${OLD_VER_REGEX}`, 'g'), `v${NEW_VER}`);
  fs.writeFileSync('server-start.ps1', ps1);
  console.log(`[OK] Updated server-start.ps1`);
} catch (e) {
  console.error(`[Error] server-start.ps1:`, e.message);
}

// 4. README.md
try {
  let readme = fs.readFileSync('README.md', 'utf8');
  // 替换版本说明
  readme = readme.replace(`**v${OLD_VER}**`, `**v${NEW_VER}**`);
  // 插入新的更新区块
  const readmePattern = new RegExp(`## v${OLD_VER_REGEX}`);
  readme = readme.replace(readmePattern, `## v${NEW_VER} ${UPDATE_DESC_DOC}\n\n### 更新细节\n- ${UPDATE_DESC_TABLE}\n\n## v${OLD_VER}`);
  fs.writeFileSync('README.md', readme);
  console.log(`[OK] Updated README.md (已插入新版本的 Release Note)`);
} catch (e) {
  console.error(`[Error] README.md:`, e.message);
}

// 5. 部署操作文档.md
try {
  let deployDoc = fs.readFileSync('部署操作文档.md', 'utf8');
  deployDoc = deployDoc.replace(`**系统版本:** v${OLD_VER}`, `**系统版本:** v${NEW_VER}`);
  deployDoc = deployDoc.replace(`**更新要点:**`, `**更新要点:** v${NEW_VER} ${UPDATE_DESC_DOC}。\n> **历史要点:**`);
  fs.writeFileSync('部署操作文档.md', deployDoc);
  console.log(`[OK] Updated 部署操作文档.md`);
} catch (e) {
  console.error(`[Error] 部署操作文档.md:`, e.message);
}

// 6. 项目需求文档.md
try {
  let reqDoc = fs.readFileSync('项目需求文档.md', 'utf8');
  reqDoc = reqDoc.replace(`文档版本**：v${OLD_VER}`, `文档版本**：v${NEW_VER}`);
  // 找到最近的一个版本表格行去插入
  const oldTableRowIndex = reqDoc.indexOf(`| **v${OLD_VER}**`);
  if (oldTableRowIndex !== -1) {
      const tableRow = `| **v${NEW_VER}** | **${UPDATE_DATE}** | **${UPDATE_DESC_TABLE}** |\n`;
      reqDoc = reqDoc.slice(0, oldTableRowIndex) + tableRow + reqDoc.slice(oldTableRowIndex);
      fs.writeFileSync('项目需求文档.md', reqDoc);
      console.log(`[OK] Updated 项目需求文档.md`);
  }
} catch (e) {
  console.error(`[Error] 项目需求文档.md:`, e.message);
}

// 7. 操作手册.md
try {
  let opDoc = fs.readFileSync('操作手册.md', 'utf8');
  opDoc = opDoc.replace(`文档版本**：v${OLD_VER}`, `文档版本**：v${NEW_VER}`);
  
  // 动态递增推导更新记录目录的章节序号
  const opLines = opDoc.split('\n');
  const oldTitleLine = opLines.find(line => line.includes(`[v${OLD_VER} 更新日志]`));
  
  if (oldTitleLine) {
     const match = oldTitleLine.match(/^(\d+)\.\s*\[v/);
     if (match) {
        let chapterNo = parseInt(match[1]);
        
        // 替换目录(TOC)
        let safeTOCRegex = new RegExp(`${chapterNo}\\.\\s*\\[v${OLD_VER_REGEX}\\s*更新日志\\]\\(#${chapterNo}-v${OLD_VER_NO_DOT}-更新日志\\)`);
        opDoc = opDoc.replace(safeTOCRegex,
          `${chapterNo}. [v${NEW_VER} 更新日志](#${chapterNo}-v${NEW_VER_NO_DOT}-更新日志)\n${chapterNo + 1}. [v${OLD_VER} 更新日志](#${chapterNo + 1}-v${OLD_VER_NO_DOT}-更新日志)`
        );

        // 替换底部的具体章节头
        let safeChapterRegex = new RegExp(`##\\s*${chapterNo}\\.\\s*v${OLD_VER_REGEX}\\s*更新日志`);
        opDoc = opDoc.replace(safeChapterRegex, 
          `## ${chapterNo}. v${NEW_VER} 更新日志\n\n### ${chapterNo}.1 系统更新内容\n${UPDATE_DESC_TABLE}\n\n## ${chapterNo + 1}. v${OLD_VER} 更新日志`
        );
     }
  }
  
  fs.writeFileSync('操作手册.md', opDoc);
  console.log(`[OK] Updated 操作手册.md`);
} catch (e) {
  console.error(`[Error] 操作手册.md:`, e.message);
}

// 8. frontend/public/VERSION
try {
  fs.writeFileSync('frontend/public/VERSION', NEW_VER);
  console.log(`[OK] Updated frontend/public/VERSION`);
} catch (e) {
  console.error(`[Error] frontend/public/VERSION:`, e.message);
}

// 9. generate.bat
try {
  let bat = fs.readFileSync('generate.bat', 'utf8');
  bat = bat.replace(new RegExp(`v${OLD_VER_REGEX}`, 'g'), `v${NEW_VER}`);
  fs.writeFileSync('generate.bat', bat);
  console.log(`[OK] Updated generate.bat`);
} catch (e) {
  console.error(`[Error] generate.bat:`, e.message);
}

// 10. generate-pdf.js
try {
  let gen = fs.readFileSync('generate-pdf.js', 'utf8');
  gen = gen.replace(new RegExp(`v${OLD_VER_REGEX}`, 'g'), `v${NEW_VER}`);
  fs.writeFileSync('generate-pdf.js', gen);
  console.log(`[OK] Updated generate-pdf.js`);
} catch (e) {
  console.error(`[Error] generate-pdf.js:`, e.message);
}

console.log('>>> Update Complete!');
