const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// 要生成的三份文档
const docs = [
  { md: '操作手册.md', html: '操作手册.html', title: '铭晟管理系统 操作手册' },
  { md: '项目需求文档.md', html: '项目需求文档.html', title: '铭晟管理系统 项目需求文档 (PRD)' },
  { md: '部署操作文档.md', html: '部署操作文档.html', title: '铭晟管理系统 部署与执行白皮书' },
];

function buildHtml(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        @page {
            size: A4;
            margin: 2cm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif;
            line-height: 1.8;
            color: #333;
            font-size: 14px;
            max-width: 210mm;
            margin: 0 auto;
            padding: 20mm;
            background: #fff;
        }
        
        h1 {
            font-size: 28px;
            color: #1a365d;
            text-align: center;
            border-bottom: 3px solid #2b6cb0;
            padding-bottom: 15px;
            margin-bottom: 30px;
            page-break-after: avoid;
        }
        
        h2 {
            font-size: 20px;
            color: #2c5282;
            border-left: 4px solid #3182ce;
            padding-left: 12px;
            margin-top: 35px;
            margin-bottom: 18px;
            page-break-after: avoid;
        }
        
        h3 {
            font-size: 16px;
            color: #2d3748;
            margin-top: 25px;
            margin-bottom: 12px;
            page-break-after: avoid;
        }
        
        h4 {
            font-size: 14px;
            color: #4a5568;
            margin-top: 18px;
            margin-bottom: 10px;
        }
        
        p {
            margin-bottom: 12px;
            text-align: justify;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
            font-size: 13px;
            page-break-inside: avoid;
        }
        
        th {
            background: #e2e8f0;
            color: #2d3748;
            font-weight: 600;
            padding: 10px 12px;
            text-align: left;
            border: 1px solid #cbd5e0;
        }
        
        td {
            padding: 10px 12px;
            border: 1px solid #e2e8f0;
            vertical-align: top;
        }
        
        tr:nth-child(even) {
            background: #f7fafc;
        }
        
        ul, ol {
            margin: 12px 0;
            padding-left: 25px;
        }
        
        li {
            margin-bottom: 6px;
        }
        
        code {
            background: #edf2f7;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: "Consolas", monospace;
            font-size: 13px;
            color: #e53e3e;
        }
        
        pre {
            background: #2d3748;
            color: #e2e8f0;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            margin: 15px 0;
            font-size: 12px;
            page-break-inside: avoid;
        }
        
        pre code {
            background: none;
            color: inherit;
            padding: 0;
        }
        
        hr {
            border: none;
            border-top: 1px solid #e2e8f0;
            margin: 30px 0;
        }
        
        strong {
            color: #1a202c;
        }
        
        blockquote {
            border-left: 4px solid #3182ce;
            padding: 10px 15px;
            margin: 15px 0;
            color: #4a5568;
            background: #f7fafc;
            border-radius: 0 5px 5px 0;
        }

        /* 版本标签 */
        .version-tag {
            display: inline-block;
            background: #ebf8ff;
            color: #2b6cb0;
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: 600;
        }
        
        /* 打印样式 */
        @media print {
            body {
                padding: 0;
            }
            
            h1, h2, h3, h4 {
                page-break-after: avoid;
            }
            
            table, pre, blockquote {
                page-break-inside: avoid;
            }
            
            h2 {
                page-break-before: auto;
            }
        }
        
        /* 封面样式 */
        .cover {
            text-align: center;
            padding-top: 150px;
            page-break-after: always;
        }
        
        .cover h1 {
            font-size: 36px;
            border: none;
            margin-bottom: 50px;
        }
        
        .cover .subtitle {
            font-size: 20px;
            color: #4a5568;
            margin-bottom: 100px;
        }
        
        .cover .info {
            font-size: 14px;
            color: #718096;
            margin-top: 50px;
        }
        
        /* 目录样式 */
        .toc {
            page-break-after: always;
        }
        
        .toc h2 {
            text-align: center;
            border: none;
            margin-bottom: 30px;
        }
        
        .toc ul {
            list-style: none;
            padding: 0;
        }
        
        .toc > ul > li {
            margin-bottom: 10px;
            font-weight: 500;
        }
        
        .toc ul ul {
            padding-left: 20px;
            margin-top: 8px;
        }
        
        .toc ul ul li {
            font-weight: normal;
            color: #4a5568;
        }

        /* 页脚 */
        .footer {
            margin-top: 60px;
            padding-top: 15px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 12px;
            color: #a0aec0;
        }
    </style>
</head>
<body>
${bodyHtml}
<div class="footer">铭晟管理系统 v1.7.0 &mdash; 本文件由 generate.bat 自动生成</div>
</body>
</html>`;
}

// 逐个生成
let successCount = 0;
docs.forEach(doc => {
  const mdPath = path.join(__dirname, doc.md);
  
  if (!fs.existsSync(mdPath)) {
    console.log(`[!] 跳过：${doc.md} 文件不存在`);
    return;
  }
  
  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  const htmlContent = marked(mdContent);
  const fullHtml = buildHtml(doc.title, htmlContent);
  
  const htmlPath = path.join(__dirname, doc.html);
  fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
  console.log(`[√] 已生成：${doc.html}`);
  successCount++;
});

console.log('');
console.log(`===== 共生成 ${successCount}/${docs.length} 个 HTML 文件 =====`);
console.log('');
console.log('如需生成 PDF：');
console.log('  1. 用浏览器打开对应的 .html 文件');
console.log('  2. 按 Ctrl+P 打开打印对话框');
console.log('  3. 目标打印机选择"另存为PDF"或"Microsoft Print to PDF"');
console.log('  4. 点击保存');
