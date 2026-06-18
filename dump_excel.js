import pkg from 'xlsx';
import fs from 'fs';
const { readFile, utils } = pkg;

try {
  const filePath = 'g:\\マイドライブ\\JAS用\\AGRI KAKUIDA\\R8アグリJAS資料\\☆オーガニック管理マニュアル（農産）福山黒酢.xlsx';
  const workbook = readFile(filePath);
  const sheetName = 'オーガニック管理マニュアル(有機農産物・有機飼料)';
  const worksheet = workbook.Sheets[sheetName];
  const data = utils.sheet_to_json(worksheet, { header: 1 });
  
  let outputText = '';
  
  data.forEach((row, idx) => {
    // 空行はスキップせず、区切りとして表示
    if (!row || row.length === 0) {
      outputText += '\n';
      return;
    }
    
    // 行データをパイプ区切りで連結し、不要な空白や未定義をフィルタ
    const filteredRow = row.map(cell => {
      if (cell === null || cell === undefined) return '';
      return String(cell).trim();
    });
    
    // 有効なデータが含まれる行のみ出力
    if (filteredRow.some(cell => cell !== '')) {
      outputText += `[Row ${idx + 1}] ` + filteredRow.join(' | ') + '\n';
    }
  });
  
  fs.writeFileSync('extracted_manual.txt', outputText, 'utf8');
  console.log('Saved extracted manual to extracted_manual.txt. Total rows:', data.length);
} catch (error) {
  console.error('Error dumping excel file:', error);
}
