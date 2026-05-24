import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const styleOptimizationTool = new FileBasedTool(
    "style_optimization",
    "Control style processing performance.",
    z.codec(
        z.object({
            action: z.enum(["set", "get"]),
            options: z.object({
                stylesCache: z.boolean().optional(),
                compactStyles: z.boolean().optional()
            })
        }),
        z.object({
            action: z.enum(["set", "get"]).nullable(),
            options: z.object({
                stylesCache: z.boolean().nullable(),
                compactStyles: z.boolean().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                action: args.action || null,
                options: args.options || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                action: value.action || undefined,
                options: value.options || undefined,
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

        if (action === "set") {
            if (cmd.args.options) {
                if (cmd.args.options.stylesCache !== undefined) {
                    ExcelJS.utils.stylesCache = cmd.args.options.stylesCache;
                }
                if (cmd.args.options.compactStyles !== undefined) {
                    ExcelJS.utils.compactStyles = cmd.args.options.compactStyles;
                }
            }
            return {
                file: workbook,
                output: { message: `Style options set`, action: "set" }
            };
        } else {
            return {
                file: workbook,
                output: {
                    message: `Style options retrieved`,
                    action: "get",
                    options: {
                        stylesCache: ExcelJS.utils.stylesCache,
                        compactStyles: ExcelJS.utils.compactStyles
                    }
                }
            };
        }
    },
);