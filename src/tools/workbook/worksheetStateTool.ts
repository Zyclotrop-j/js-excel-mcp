import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const worksheetStateTool = new FileBasedTool(
    "worksheet_state",
    "Control worksheet visibility state (visible, hidden, veryHidden).",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            state: z.enum(['visible', 'hidden', 'veryHidden'])
        }),
        z.object({
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable(),
            state: z.enum(['visible', 'hidden', 'veryHidden'])
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null,
                state: args.state
            }),
            encode: (value) => ({
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId !== null ? value.worksheetId : undefined,
                state: value.state
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            previousState: z.string(),
            newState: z.string(),
            totalSheets: z.number()
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            previousState: z.string(),
            newState: z.string(),
            totalSheets: z.number()
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

        // Store previous state
        const previousState = worksheet.state || 'visible';

        // Set new state
        worksheet.state = cmd.args.state;

        return {
            file: workbook,
            output: {
                message: `Successfully updated worksheet "${worksheet.name}" state`,
                worksheetName: worksheet.name,
                worksheetId: worksheet.id,
                previousState,
                newState: cmd.args.state,
                totalSheets: workbook.worksheetNames.length
            }
        };
    },
);