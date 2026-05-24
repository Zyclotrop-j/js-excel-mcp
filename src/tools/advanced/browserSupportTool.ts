import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const browserSupportTool = new FileBasedTool(
    "browser_support",
    "Use ExcelJS in web browsers.",
    z.codec(
        z.object({
            fileName: z.string(),
            data: z.string()
        }),
        z.object({
            fileName: z.string(),
            data: z.string(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                fileName: args.fileName,
                data: args.data,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                fileName: value.fileName,
                data: value.data,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string()
        }),
        z.object({
            message: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const args = cmd.args;
        const workbook = new ExcelJS.Workbook();
        
        const buffer = Buffer.from(args.data, 'base64');
        await workbook.xlsx.load(buffer);

        return {
            file: workbook,
            output: { message: `Workbook loaded from base64 data` }
        };
    },
);