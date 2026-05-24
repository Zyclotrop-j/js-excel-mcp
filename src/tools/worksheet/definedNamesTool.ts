import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const definedNamesTool = new FileBasedTool(
    "defined_names",
    "Assign names to cells for use in formulas.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            name: z.string(),
            refersTo: z.string(),
            comment: z.string().optional(),
            scope: z.string().optional(),
            localSheet: z.boolean().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            name: z.string(),
            refersTo: z.string(),
            comment: z.string().nullable(),
            scope: z.string().nullable(),
            localSheet: z.boolean().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                name: args.name,
                refersTo: args.refersTo,
                comment: args.comment || null,
                scope: args.scope || null,
                localSheet: args.localSheet !== undefined ? args.localSheet : null,
            }),
            encode: (value) => ({
                name: value.name,
                refersTo: value.refersTo,
                comment: value.comment,
                scope: value.scope,
                localSheet: value.localSheet,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            name: z.string(),
            refersTo: z.string()
        }),
        z.object({
            message: z.string(),
            name: z.string(),
            refersTo: z.string()
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

        const definedName = worksheet.definedNames.add(cmd.args.name, cmd.args.refersTo);
        if (cmd.args.comment) definedName.comment = cmd.args.comment;
        if (cmd.args.scope) definedName.scope = cmd.args.scope;
        if (cmd.args.localSheet !== undefined) definedName.localSheet = cmd.args.localSheet;

        return {
            file: workbook,
            output: {
                message: `Defined name "${cmd.args.name}" added`,
                name: cmd.args.name,
                refersTo: cmd.args.refersTo
            }
        };
    },
);