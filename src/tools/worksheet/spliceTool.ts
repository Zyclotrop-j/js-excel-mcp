import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const spliceTool = new FileBasedTool(
    "splice",
    "Cut/remove rows or cells and optionally insert new ones.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            type: z.enum(["row", "cell"]),
            position: z.number(),
            count: z.number(),
            values: z.array(z.unknown()).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            type: z.enum(["row", "cell"]).nullable(),
            position: z.number(),
            count: z.number(),
            values: z.array(z.unknown()).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                type: args.type || null,
                position: args.position,
                count: args.count,
                values: args.values || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                type: value.type,
                position: value.position,
                count: value.count,
                values: value.values,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            type: z.string(),
            removed: z.number()
        }),
        z.object({
            message: z.string(),
            type: z.string(),
            removed: z.number()
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

        const type = cmd.args.type;
        const position = cmd.args.position;
        const count = cmd.args.count;

        if (type === "row") {
            for (let i = 0; i < count; i++) {
                worksheet.removeRow(position);
            }
            if (cmd.args.values) {
                for (let i = 0; i < cmd.args.values.length; i++) {
                    worksheet.addRow(cmd.args.values[i], position + i);
                }
            }
            return {
                file: workbook,
                output: { message: `Spliced ${count} rows`, type: "row", removed: count }
            };
        } else {
            for (let i = 0; i < count; i++) {
                worksheet.removeCell(position, i);
            }
            if (cmd.args.values) {
                for (let i = 0; i < cmd.args.values.length; i++) {
                    worksheet.getCell(position, i).value = cmd.args.values[i];
                }
            }
            return {
                file: workbook,
                output: { message: `Spliced ${count} cells`, type: "cell", removed: count }
            };
        }
    },
);