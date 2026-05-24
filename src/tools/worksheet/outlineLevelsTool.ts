import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const outlineLevelsTool = new FileBasedTool(
    "outline_levels",
    "Set expand/collapse levels for rows and columns.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            type: z.enum(["row", "column"]),
            rowOrColumn: z.number(),
            level: z.number()
        }),
        z.object({
            sheet: z.string().nullable(),
            type: z.enum(["row", "column"]).nullable(),
            rowOrColumn: z.number(),
            level: z.number(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                type: args.type || null,
                rowOrColumn: args.rowOrColumn,
                level: args.level,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                type: value.type,
                rowOrColumn: value.rowOrColumn,
                level: value.level,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            type: z.string(),
            rowOrColumn: z.number(),
            level: z.number()
        }),
        z.object({
            message: z.string(),
            type: z.string(),
            rowOrColumn: z.number(),
            level: z.number()
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
        const index = cmd.args.rowOrColumn;
        const level = cmd.args.level;

        if (type === "row") {
            const row = worksheet.getRow(index);
            row.outlineLevel = level;
        } else {
            const col = worksheet.getColumn(index);
            col.outlineLevel = level;
        }

        return {
            file: workbook,
            output: {
                message: `${type} ${index} outline level set to ${level}`,
                type,
                rowOrColumn: index,
                level
            }
        };
    },
);