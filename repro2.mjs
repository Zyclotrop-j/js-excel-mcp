import { createWorkbook, addWorksheet } from '@office-kit/xlsx/workbook';
import { setCellByCoord, getCellByCoord } from '@office-kit/xlsx/worksheet';
import { cellValueAsString } from '@office-kit/xlsx/cell';
import { workbookToBytes, loadWorkbook, fromArrayBuffer } from '@office-kit/xlsx/io';

const wb = createWorkbook();
addWorksheet(wb, 'Sheet1');
const ws = wb.sheets[0].sheet;

const testValues = ['!', 'hello', 'world', 'foo', 'bar'];

for (const val of testValues) {
    setCellByCoord(ws, 'A1', val);
    const cellBefore = getCellByCoord(ws, 'A1');
    console.log(`Written: ${JSON.stringify(val)}, cell.value before save: ${JSON.stringify(cellBefore.value)}`);
    
    const bytes = await workbookToBytes(wb);
    console.log(`  bytes length: ${bytes.length}`);
    
    const wb2 = await loadWorkbook(fromArrayBuffer(bytes));
    const ws2 = wb2.sheets[0].sheet;
    const cellAfter = getCellByCoord(ws2, 'A1');
    
    if (cellAfter) {
        console.log(`  After load: cell.value=${JSON.stringify(cellAfter.value)}, cellValueAsString=${JSON.stringify(cellValueAsString(cellAfter.value))}`);
    } else {
        console.log(`  After load: cell is null/undefined`);
    }
}
