import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const accessWorksheetsTool = new FileBasedTool(
    "access_worksheets",
    "Access worksheets by name, ID, or list all worksheets in the workbook.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            listAll: z.boolean().optional()
        }),
        z.object({
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable(),
            listAll: z.boolean().nullable()
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null,
                listAll: args.listAll != undefined ? args.listAll : null
            }),
            encode: (value) => ({
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId !== null ? value.worksheetId : undefined,
                listAll: value.listAll !== null ? value.listAll : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheets: z.array(z.object({
                name: z.string(),
                id: z.number(),
                state: z.enum(['visible', 'hidden', 'veryHidden']),
                rowCount: z.number(),
                columnCount: z.number(),
                lastColumn: z.number(),
                actualRowCount: z.number()
            })),
            selectedWorksheet: z.object({
                name: z.string(),
                id: z.number(),
                state: z.enum(['visible', 'hidden', 'veryHidden']),
                rowCount: z.number(),
                columnCount: z.number(),
                lastColumn: z.number(),
                actualRowCount: z.number()
            }).nullable()
        }),
        z.object({
            message: z.string(),
            worksheets: z.array(z.object({
                name: z.string(),
                id: z.number(),
                state: z.enum(['visible', 'hidden', 'veryHidden']),
                rowCount: z.number(),
                columnCount: z.number(),
                lastColumn: z.number(),
                actualRowCount: z.number()
            })),
            selectedWorksheet: z.object({
                name: z.string(),
                id: z.number(),
                state: z.enum(['visible', 'hidden', 'veryHidden']),
                rowCount: z.number(),
                columnCount: z.number(),
                lastColumn: z.number(),
                actualRowCount: z.number()
            }).nullable()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        const worksheet = getWorksheet(cmd.args, workbook, false);

        // Get worksheet info
        const worksheets = [];

        workbook.eachSheet((ws, sheetId) => {
            worksheets.push({
                name: ws.name,
                id: sheetId,
                state: ws.state || 'visible',
                rowCount: ws.rowCount,
                columnCount: ws.columnCount,
                lastColumn: ws.lastColumn,
                actualRowCount: ws.actualRowCount
            });
        });

        let selectedWorksheet = null;
        if (cmd.args.worksheetName || cmd.args.worksheetId != undefined) {
            selectedWorksheet = {
                name: worksheet.name,
                id: worksheet.id,
                state: worksheet.state || 'visible',
                rowCount: worksheet.rowCount,
                columnCount: worksheet.columnCount,
                lastColumn: worksheet.lastColumn,
                actualRowCount: worksheet.actualRowCount
            };
        }

        return {
            file: workbook,
            output: {
                message: `Worksheet information retrieved`,
                worksheets,
                selectedWorksheet
            }
        };
    },
);