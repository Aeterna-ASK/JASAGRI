import pkg from 'xlsx';
const { readFile, utils } = pkg;

try {
  const filePath = 'g:\\マイドライブ\\JAS用\\AGRI KAKUIDA\\R8アグリJAS資料\\☆オーガニック管理マニュアル（農産）福山黒酢.xlsx';
  console.log('Opening file:', filePath);
  
  const workbook = readFile(filePath);
  console.log('Sheet names:', workbook.SheetNames);
  
  // 各シートの最初の数行を出力して中身を確認
  workbook.SheetNames.forEach(sheetName => {
    console.log(`\n=================== SHEET: ${sheetName} ===================`);
    const worksheet = workbook.Sheets[sheetName];
    const data = utils.sheet_to_json(worksheet, { header: 1 });
    
    // 最初の20行のみ表示
    data.slice(0, 30).forEach((row, idx) => {
      if (row.length > 0) {
        console.log(`Row ${idx + 1}:`, row.filter(cell => cell !== null && cell !== undefined).join(' | '));
      }
    });
  });
} catch (error) {
  console.error('Error parsing excel file:', error);
}
