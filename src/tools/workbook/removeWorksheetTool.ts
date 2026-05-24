import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const removeWorksheetTool = new FileBasedTool(
    "remove_worksheet",
    "Remove a worksheet from the workbook by worksheet ID.",
    z.codec(
        z.object({
            worksheetId: z.number()
        }),
        z.object({
            worksheetId: z.number()
        }),
        {
            decode: (args) => ({
                worksheetId: args.worksheetId
            }),
            encode: (value) => ({
                worksheetId: value.worksheetId
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            removedWorksheetName: z.string(),
            remainingSheets: z.array(z.string()),
            sheetCount: z.number()
        }),
        z.object({
            message: z.string(),
            removedWorksheetName: z.string(),
            remainingSheets: z.array(z.string()),
            sheetCount: z.number()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        
        // Find the worksheet by ID
        let worksheetToRemove = null;
        let worksheetName = '';
        
        workbook.eachSheet((worksheet, sheetId) => {
            if (sheetId === cmd.args.worksheetId) {
                worksheetToRemove = worksheet;
                worksheetName = worksheet.name;
            }
        });

        if (!worksheetToRemove) {
            throw new Error(`Worksheet with ID ${cmd.args.worksheetId} not found`);
        }

        // Remove the worksheet
        workbook.removeWorksheet(cmd.args.worksheetId);

        return {
            file: workbook,
            output: {
                message: `Successfully removed worksheet "${worksheetName}"`,
                removedWorksheetName: worksheetName,
                remainingSheets: workbook.worksheetNames,
                sheetCount: workbook.worksheetNames.length
            }
        };
    },
);