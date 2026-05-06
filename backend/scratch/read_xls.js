const xlsx = require('xlsx');

try {
  const workbook = xlsx.readFile('D:/项目/erp-mes-system/产量计算公式表.xls');
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    data.forEach(row => console.log(JSON.stringify(row)));
  }
} catch (e) {
  console.error(e);
}
