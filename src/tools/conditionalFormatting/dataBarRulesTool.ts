import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const dataBarRulesTool = new FileBasedTool(
    "data_bar_rules",
    "Add data bars for visual comparison.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                color: z.object({
                    argb: z.string(),
                    type: z.string()
                }),
                minLength: z.number().optional(),
                maxLength: z.number().optional(),
                showData: z.boolean().optional()
            })
        }),
        z.object({
            sheet: z.string().nullable(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                color: z.object({
                    argb: z.string(),
                    type: z.string()
                }),
                minLength: z.number().nullable(),
                maxLength: z.number().nullable(),
                showData: z.boolean().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                range: args.range,
                rule: args.rule || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                range: value.range,
                rule: value.rule || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                color: z.object({ argb: z.string() })
            })
        }),
        z.object({
            message: z.string(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                color: z.object({ argb: z.string() })
            })
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

        if (!worksheet) {
            throw new Error(`Worksheet not found`);
        }

        const cfRule = worksheet.addConditionalFormatting(cmd.args.range);
        cfRule.addRule(cmd.args.rule);

        return {
            file: workbook,
            output: {
                message: `DataBar rule added`,
                range: cmd.args.range,
                rule: {
                    type: cmd.args.rule.type,
                    color: cmd.args.rule.color
                }
            }
        };
    },
);