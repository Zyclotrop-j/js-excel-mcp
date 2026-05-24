import { FileBasedTool } from "./toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../services/excelutils.js";
import { cellValue } from "../services/exceltypes.js";
import getWorksheet from "../services/getWorkSheet.js";

export const writeExcelTool = new FileBasedTool(
    "write_excel",
    "Write data to an Excel file.",
    z.codec(
        z.object({
            filePath: z.string(),
            data: z.array(z.record(z.string(), z.union([cellValue, z.date()]))),
            sheetName: z.string().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            filePath: z.string(),
            data: z.array(z.record(z.string(), z.union([cellValue, z.date()])))
        }),
        {
            decode: (args) => ({
                filePath: args.filePath,
                data: args.data,
                sheet: args.sheet || undefined
            }),
            encode: (value) => ({
                filePath: value.filePath,
                data: value.data,
                sheetName: value.sheet || null
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            rowCount: z.number(),
            columnCount: z.number(),
            sheetName: z.string()
        }),
        z.object({
            message: z.string(),
            rowCount: z.number(),
            columnCount: z.number(),
            sheetName: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        // Get or create sheet
        const worksheet = getWorksheet(cmd.args, cmd.file, true);

        // Clear existing content
        worksheet.spliceRows(1, worksheet.rowCount);

        if (cmd.args.data.length === 0) {
            return {
                file: cmd.file,
                output: {
                    message: "Empty data provided - no rows written to Excel file",
                    rowCount: 0,
                    columnCount: 0,
                    sheetName: worksheet.name
                }
            };
        }

        // Get headers from first data row
        const headers = Object.keys(cmd.args.data[0]);

        // Write headers
        const headerRow = worksheet.getRow(1);
        headers.forEach((header, index) => {
            headerRow.getCell(index + 1).value = header;
        });
        headerRow.commit();

        // Write data rows
        cmd.args.data.forEach((row, rowIndex) => {
            const dataRow = worksheet.getRow(rowIndex + 2);
            headers.forEach((header, colIndex) => {
                const cellValue = row[header] != undefined ? row[header] : null;
                // @ts-ignore - ExcelJS handles Date objects but TypeScript doesn't recognize it
                dataRow.getCell(colIndex + 1).value = cellValue;
            });
            dataRow.commit();
        });

        return {
            file: cmd.file,
            output: {
                message: `Successfully wrote ${cmd.args.data.length} rows to sheet "${worksheet.name}"`,
                rowCount: cmd.args.data.length,
                columnCount: headers.length,
                sheetName: worksheet.name
            }
        };
    },
);