import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const sharedStringsTool = new FileBasedTool(
    "shared_strings",
    "Optimize string storage.",
    z.codec(
        z.object({
            action: z.enum(["add", "get", "count"]),
            text: z.string().optional()
        }),
        z.object({
            action: z.enum(["add", "get", "count"]).nullable(),
            text: z.string().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                action: args.action || null,
                text: args.text || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                action: value.action || undefined,
                text: value.text || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            action: z.string()
        }),
        z.object({
            message: z.string(),
            action: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        const action = cmd.args.action;

        if (action === "add") {
            const id = workbook.addSharedString(cmd.args.text);
            return {
                file: workbook,
                output: { message: `Shared string added`, action: "add", id }
            };
        } else if (action === "get") {
            const ss = workbook.getSharedString(cmd.args.text);
            return {
                file: workbook,
                output: { message: `Shared string retrieved`, action: "get", text: ss }
            };
        } else {
            return {
                file: workbook,
                output: { message: `Shared strings count`, action: "count", count: workbook.sharedStrings.length }
            };
        }
    },
);