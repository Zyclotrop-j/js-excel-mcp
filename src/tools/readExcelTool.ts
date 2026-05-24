import { FileBasedTool } from "./toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../services/excelutils.js";
import { cellValue } from "../services/exceltypes.js";
import { getWorksheet } from "../services/getWorkSheet.js";

export const readExcelTool = new FileBasedTool(
    "read_excel",
    "Read data from an Excel file. Returns rows as JSON objects with column headers as keys.",
    z.codec(
        z.object({
            filePath: z.string().meta({description: "Path to the Excel file to read. Examples: \"data.xlsx\", \"C:\\\\Documents\\\\report.xlsx\", \"./files\\\\data.xlsx\""}),
            sheetName: z.string().optional().meta({description: "Name of the specific sheet to read. If not provided, reads the first sheet. Examples: \"Sheet1\", \"Data\", \"Summary\""})
        }).meta({description: "Input parameters for reading an Excel file"}),
        z.object({
            sheet: z.string().nullable(),
            filePath: z.string()
        }),
        {
            decode: (args) => ({
                filePath: args.filePath,
                sheet: args.sheetName || null
            }),
            encode: (value) => ({
                filePath: value.filePath,
                sheetName: value.sheet || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            data: z.array(z.record(z.string(), cellValue)).meta({description: "Array of rows, where each row is an object with column headers as keys and cell values as values"}),
            headers: z.array(z.string()).meta({description: "Array of column headers extracted from the first row of the sheet"}),
            sheetName: z.string().meta({description: "Name of the sheet that was read"}),
            rowCount: z.number().meta({description: "Number of data rows read (excluding the header row)"}),
            columnCount: z.number().meta({description: "Number of columns in the sheet"})
        }).meta({description: "Result of reading Excel data with parsed rows, headers, and metadata"}),
        z.object({
            data: z.array(z.record(z.string(), cellValue)).meta({description: "Array of rows, where each row is an object with column headers as keys and cell values as values"}),
            headers: z.array(z.string()).meta({description: "Array of column headers extracted from the first row of the sheet"}),
            sheetName: z.string().meta({description: "Name of the sheet that was read"}),
            rowCount: z.number().meta({description: "Number of data rows read (excluding the header row)"}),
            columnCount: z.number().meta({description: "Number of columns in the sheet"})
        }).meta({description: "Result of reading Excel data with parsed rows, headers, and metadata"}),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const worksheet = getWorksheet(cmd.args, cmd.file, false);

        if (!worksheet) {
            throw new Error(`Sheet ${cmd.args.sheet || "first sheet"} not found`);
        }

        const headers: string[] = [];
        const data: any[] = [];

        // Get headers from first row (with automatic header detection)
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
            const headerValue = cell.value;
            if (headerValue !== null && headerValue != undefined) {
                headers.push(String(headerValue));
            }
        });

        // Read data rows
        for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
            const rowData: any = {};
            const row = worksheet.getRow(rowNumber);

            row.eachCell((cell, colNumber) => {
                if (colNumber <= headers.length) {
                    const header = headers[colNumber - 1];
                    const cellValue = cell.value;
                    rowData[header] = cellValue !== null && cellValue != undefined ? cellValue : null;
                }
            });

            // Only add row if it has data
            if (Object.keys(rowData).length > 0) {
                data.push(rowData);
            }
        }

        return {
            file: cmd.file,
            output: {
                data,
                headers,
                sheetName: worksheet.name,
                rowCount: data.length,
                columnCount: headers.length
            }
        };
    },
);