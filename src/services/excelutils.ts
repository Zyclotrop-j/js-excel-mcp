import { Workbook } from "exceljs";
import { FileSerialiser } from "./utiltypes.js"

export class ExcelFileSerialiser extends FileSerialiser<Workbook> {
    async deserialize(path: string): Promise<Workbook> {
        const workbook = new Workbook();
        await workbook.xlsx.readFile(path);
        return workbook;
    }
    async serialize(data: Workbook): Promise<string> {
        await data.xlsx.writeFile("output.xlsx");
        return "output.xlsx";
    }
    get outputFileName(): string {
        return "output.xlsx";
    }
    get outputMimeType(): string {
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
}

export function parseExcelReference(refString: string): { sheet: string | null; cell: string } {
  const regex = /^(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})?)$/;
  const match = refString.match(regex);

  if (!match) throw new Error(`Invalid Excel reference: ${refString}`);

  return {
    // Group 1 catches quoted sheets, Group 2 catches unquoted sheets
    sheet: match[1] || match[2] || null, 
    // Group 3 catches the entire cell or range reference
    cell: match[3]
  };
}
export function formatExcelReference({ sheet, cell }: { sheet: string | null; cell: string }) {
  if (!sheet) return cell;
  
  // Wrap in quotes if there are spaces, symbols, or it looks like a cell (e.g., "A1")
  const needsQuotes = /[^A-Za-z0-9_]|^[A-Za-z]{1,3}[1-9]\d*$/i.test(sheet);
  
  // Escape existing single quotes by doubling them up up (' -> '')
  const safeSheet = needsQuotes 
    ? `'${sheet.replace(/'/g, "''")}'` 
    : sheet;

  return `${safeSheet}!${cell}`;
};