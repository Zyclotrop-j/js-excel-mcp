import { Workbook } from "exceljs";
import * as fs from "fs";
import * as path from "path";

export class ExcelService {
  async readExcel(
    filePath: string,
    sheetName?: string
  ): Promise<Record<string, unknown>[]> {
    const workbook = new Workbook();
    await workbook.xlsx.readFile(filePath);

    let worksheet = workbook.getWorksheet(1);

    if (sheetName) {
      const sheet = workbook.getWorksheet(sheetName);
      if (!sheet) {
        throw new Error(`Sheet "${sheetName}" not found`);
      }
      worksheet = sheet;
    }

    if (!worksheet) {
      throw new Error("No worksheets found in the file");
    }

    const data: Record<string, unknown>[] = [];
    let headerRow: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        headerRow = row.values as string[];
      } else {
        const rowData: Record<string, unknown> = {};
        row.values?.forEach((value, index) => {
          if (headerRow[index]) {
            rowData[headerRow[index]] = value;
          }
        });
        data.push(rowData);
      }
    });

    return data;
  }

  async writeExcel(
    filePath: string,
    data: Record<string, unknown>[],
    sheetName = "Sheet1"
  ): Promise<string> {
    if (data.length === 0) {
      throw new Error("No data to write");
    }

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    // Get headers from first row
    const headers = Object.keys(data[0]);
    worksheet.addRow(headers);

    // Add data rows
    data.forEach((row) => {
      const values = headers.map((header) => row[header]);
      worksheet.addRow(values);
    });

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await workbook.xlsx.writeFile(filePath);
    return `Successfully wrote ${data.length} rows to ${filePath}`;
  }

  async listSheets(filePath: string): Promise<string[]> {
    const workbook = new Workbook();
    await workbook.xlsx.readFile(filePath);

    return workbook.worksheets.map((ws) => ws.name);
  }
}