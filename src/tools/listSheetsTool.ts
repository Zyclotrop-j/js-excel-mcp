import { FileBasedTool } from "./toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../services/excelutils.js";
import { WorksheetState } from "exceljs";

export const listSheetsTool = new FileBasedTool(
    "list_sheets",
    "List all sheet names in an Excel file.",
    z.codec(
        z.object({
            filePath: z.string()
        }),
        z.object({
            filePath: z.string()
        }),
        {
            decode: (args) => ({
                filePath: args.filePath
            }),
            encode: (value) => ({
                filePath: value.filePath
            }),
        }
    ),
    z.codec(
        z.object({
            sheets: z.array(z.object({
                name: z.string(),
                sheetId: z.number(),
                state: z.enum(["visible", "hidden", "veryHidden"])
            })),
            totalSheets: z.number()
        }),
        z.object({
            sheets: z.array(z.object({
                name: z.string(),
                sheetId: z.number(),
                state: z.enum(["visible", "hidden", "veryHidden"])
            })),
            totalSheets: z.number()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const sheets: {
            name: string;
            sheetId: number;
            state: WorksheetState;
        }[] = [];
        
        // Get all worksheets
        cmd.file.eachSheet((worksheet, sheetId) => {
            sheets.push({
                name: worksheet.name,
                sheetId: sheetId,
                state: worksheet.state || "visible"
            });
        });

        return {
            file: cmd.file,
            output: {
                sheets: sheets,
                totalSheets: sheets.length
            }
        };
    },
);