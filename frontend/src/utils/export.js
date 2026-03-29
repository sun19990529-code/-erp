import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * 通用 Excel 导出工具
 * @param {Object} options
 * @param {string} options.filename - 文件名（不含后缀）
 * @param {Array<Object>} options.columns - 列定义 [{ header: '名称', key: 'name', width: 20 }]
 * @param {Array<Object>} options.data - 数据行
 * @param {string} [options.sheetName='Sheet1'] - 工作表名
 */
export function exportToExcel({ filename, columns, data, sheetName = 'Sheet1' }) {
  // 1. 构建表头行
  const headers = columns.map(c => c.header);

  // 2. 构建数据行
  const rows = data.map(row =>
    columns.map(col => {
      const value = typeof col.key === 'function' ? col.key(row) : row[col.key];
      return value ?? '';
    })
  );

  // 3. 创建工作表
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // 4. 设置列宽
  ws['!cols'] = columns.map(c => ({ wch: c.width || 15 }));

  // 5. 创建工作簿并导出
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${filename}.xlsx`);
}

/**
 * 多工作表 Excel 导出
 * @param {string} filename
 * @param {Array<{ sheetName, columns, data }>} sheets
 */
export function exportMultiSheet(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ sheetName, columns, data }) => {
    const headers = columns.map(c => c.header);
    const rows = data.map(row =>
      columns.map(col => {
        const value = typeof col.key === 'function' ? col.key(row) : row[col.key];
        return value ?? '';
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = columns.map(c => ({ wch: c.width || 15 }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${filename}.xlsx`);
}

/**
 * 通用 CSV 导出（轻量方案，无需额外库）
 */
export function exportToCSV({ filename, columns, data }) {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const headers = columns.map(c => `"${c.header}"`).join(',');
  const rows = data.map(row =>
    columns.map(col => {
      const val = typeof col.key === 'function' ? col.key(row) : row[col.key];
      return `"${String(val ?? '').replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = BOM + [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${filename}.csv`);
}

/**
 * PDF 单据导出工具
 * 使用 jspdf + jspdf-autotable
 * 中文方案：jspdf 内置的 helvetica 不支持中文，因此表头用 Unicode 编码的简写标识 + 中文用 autoTable 的 willDrawCell 回退
 * 实际方案：直接用 HTML 转 PDF 来规避字体问题
 */
export async function exportToPDF({ filename, title, subtitle, columns, data, meta = [], orientation = 'portrait' }) {
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default || autoTableModule;
  
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // 中文支持：添加思源字体（base64 内嵌方案太大，改用方块字符替代 + canvas 绘制标题）
  // 实用方案：利用 canvas 渲染中文标题为图片贴入 PDF
  const drawChineseText = (text, x, y, fontSize = 16, color = '#1a1a1a') => {
    const canvas = document.createElement('canvas');
    const scale = 3;
    canvas.width = pageWidth * scale * 3;
    canvas.height = (fontSize + 10) * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize * scale}px "Microsoft YaHei", "SimHei", sans-serif`;
    ctx.fillText(text, 0, fontSize * scale);
    // 裁剪实际宽度
    const measured = ctx.measureText(text).width;
    const imgWidth = measured / scale / 3;
    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', x, y, imgWidth, fontSize * 0.45);
    return imgWidth;
  };
  
  // 标题
  let yPos = 12;
  if (title) {
    drawChineseText(title, 10, yPos, 18, '#111827');
    yPos += 10;
  }
  if (subtitle) {
    drawChineseText(subtitle, 10, yPos, 10, '#6b7280');
    yPos += 6;
  }
  
  // 元数据行
  if (meta.length > 0) {
    yPos += 2;
    meta.forEach(row => {
      drawChineseText(row, 10, yPos, 9, '#374151');
      yPos += 5;
    });
    yPos += 2;
  }
  
  // 表格数据 — 使用共享 canvas 渲染中文 cell（性能优化：复用单一 canvas）
  const headLabels = columns.map(c => c.header);
  const bodyRows = data.map(row => 
    columns.map(col => {
      const val = typeof col.key === 'function' ? col.key(row) : row[col.key];
      return String(val ?? '');
    })
  );
  
  // 共享 canvas — 避免 per-cell 创建
  const sharedCanvas = document.createElement('canvas');
  const sharedCtx = sharedCanvas.getContext('2d');
  const scale = 3;
  
  const renderRow = (cells, cellWidths, rowHeight, fontSize = 8, isBold = false, bgColor = null) => {
    const totalWidth = cellWidths.reduce((a, b) => a + b, 0);
    sharedCanvas.width = totalWidth * scale * 3;
    sharedCanvas.height = rowHeight * scale * 3;
    sharedCtx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);
    
    let xOffset = 0;
    cells.forEach((text, i) => {
      const cellW = cellWidths[i] * scale * 3;
      if (bgColor) {
        sharedCtx.fillStyle = bgColor;
        sharedCtx.fillRect(xOffset, 0, cellW, sharedCanvas.height);
      }
      sharedCtx.fillStyle = isBold ? '#1f2937' : '#374151';
      sharedCtx.font = `${isBold ? 'bold ' : ''}${fontSize * scale}px "Microsoft YaHei", "SimHei", sans-serif`;
      sharedCtx.fillText(String(text), xOffset + 4 * scale, 16 * scale);
      xOffset += cellW;
    });
    return sharedCanvas.toDataURL('image/png');
  };
  
  // 计算列宽
  const colWidths = columns.map(c => c.pdfWidth || (pageWidth - 20) / columns.length);
  const totalTableWidth = colWidths.reduce((a, b) => a + b, 0);
  
  // 绘制表头（单张图片）
  const headerImg = renderRow(headLabels, colWidths, 8, 8, true, '#f3f4f6');
  doc.addImage(headerImg, 'PNG', 10, yPos, totalTableWidth, 8);
  yPos += 8;
  
  // 绘制数据行（每行一张图片）
  bodyRows.forEach(row => {
    if (yPos > doc.internal.pageSize.getHeight() - 20) {
      doc.addPage();
      yPos = 10;
    }
    const rowImg = renderRow(row, colWidths, 7, 7, false);
    doc.addImage(rowImg, 'PNG', 10, yPos, totalTableWidth, 7);
    // 行底线
    doc.setDrawColor(229, 231, 235);
    doc.line(10, yPos + 7, pageWidth - 10, yPos + 7);
    yPos += 7;
  });
  
  // 页脚
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - 25, doc.internal.pageSize.getHeight() - 5);
    const now = new Date().toLocaleString('zh-CN');
    drawChineseText(`铭晟管理系统 · ${now}`, 10, doc.internal.pageSize.getHeight() - 7, 7, '#9ca3af');
  }
  
  doc.save(`${filename}.pdf`);
}
