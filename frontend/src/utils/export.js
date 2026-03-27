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
