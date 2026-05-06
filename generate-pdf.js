const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const puppeteer = require('puppeteer');

// Markdown files now live in docs/
const DOCS_DIR = path.join(__dirname, 'docs');

const docs = [
  { md: '操作手册.md', pdf: '操作手册.pdf', title: '铭晟管理系统 操作手册' },
  { md: '项目需求文档.md', pdf: '项目需求文档.pdf', title: '铭晟管理系统 项目需求文档 (PRD)' },
  { md: '部署操作文档.md', pdf: '部署操作文档.pdf', title: '铭晟管理系统 部署与执行白皮书' },
];

function buildHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
            line-height: 1.8;
            color: #333;
            font-size: 14px;
            margin: 0 auto;
            padding: 20px;
            background: #fff;
        }
        h1 { font-size: 28px; color: #1a365d; text-align: center; border-bottom: 3px solid #2b6cb0; padding-bottom: 15px; margin-bottom: 30px; }
        h2 { font-size: 20px; color: #2c5282; border-left: 4px solid #3182ce; padding-left: 12px; margin-top: 35px; margin-bottom: 18px; }
        h3 { font-size: 16px; color: #2d3748; margin-top: 25px; margin-bottom: 12px; }
        h4 { font-size: 14px; color: #4a5568; margin-top: 18px; margin-bottom: 10px; }
        p { margin-bottom: 12px; text-align: justify; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }
        th { background: #e2e8f0; color: #2d3748; font-weight: 600; padding: 10px 12px; text-align: left; border: 1px solid #cbd5e0; }
        td { padding: 10px 12px; border: 1px solid #e2e8f0; vertical-align: top; }
        tr:nth-child(even) { background: #f7fafc; }
        ul, ol { margin: 12px 0; padding-left: 25px; }
        li { margin-bottom: 6px; }
        code { background: #edf2f7; padding: 2px 6px; border-radius: 3px; font-family: "Consolas", monospace; font-size: 13px; color: #e53e3e; }
        pre { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 5px; overflow-x: auto; margin: 15px 0; font-size: 12px; }
        pre code { background: none; color: inherit; padding: 0; }
        hr { border: none; border-top: 1px solid #e2e8f0; margin: 30px 0; }
        strong { color: #1a202c; }
        blockquote { border-left: 4px solid #3182ce; padding: 10px 15px; margin: 15px 0; color: #4a5568; background: #f7fafc; }
        .footer { margin-top: 60px; padding-top: 15px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #a0aec0; }
    </style>
</head>
<body>
${bodyHtml}
<div class="footer">铭晟管理系统 &mdash; 自动化引擎生成</div>
</body>
</html>`;
}

async function generatePDFs() {
  console.log('🚀 启动全新安全轻量引擎 Puppeteer...');
  const browser = await puppeteer.launch({ headless: 'new' });
  let successCount = 0;

  for (const doc of docs) {
    const mdPath = path.join(DOCS_DIR, doc.md);
    
    if (!fs.existsSync(mdPath)) {
      console.log(`[!] 跳过：${doc.md} 文件不存在`);
      continue;
    }

    try {
      console.log(`⏳ 正在渲染: ${doc.title}...`);
      const mdContent = fs.readFileSync(mdPath, 'utf-8');
      const htmlContent = marked.parse(mdContent);
      const fullHtml = buildHtml(doc.title, htmlContent);

      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: 'domcontentloaded' });
      
      const pdfPath = path.join(DOCS_DIR, doc.pdf);
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: '<div style="font-size: 10px; width: 100%; text-align: center; color: #a0aec0;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      });
      
      console.log(`[√] 生成完毕，文件已保存至：docs/${doc.pdf}`);
      successCount++;
    } catch (err) {
      console.error(`[x] ${doc.title} 生成失败:`, err.message);
    }
  }

  await browser.close();
  console.log(`\n🎉 任务完成！共生成 ${successCount}/${docs.length} 个纯净安全的 PDF 文件放在了 docs/ 文件夹下。`);
}

generatePDFs().catch(console.error);
