import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const cellIsRulesTool = new FileBasedTool(
    "cell_is_rules",
    "Compare cell values with operators.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                operator: z.string(),
                formula: z.string().optional(),
                style: z.object({
                    font: z.object({
                        color: z.object({ argb: z.string().optional() }).optional()
                    }).optional(),
                    fill: z.object({
                        fgColor: z.object({ argb: z.string().optional() }).optional()
                    }).optional()
                }).optional()
            })
        }),
        z.object({
            sheet: z.string().nullable(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                operator: z.string(),
                formula: z.string().nullable(),
                style: z.object({
                    font: z.object({
                        color: z.object({ argb: z.string().nullable() }).nullable()
                    }).nullable(),
                    fill: z.object({
                        fgColor: z.object({ argb: z.string().nullable() }).nullable()
                    }).nullable()
                }).nullable(),
                worksheetName: z.string().nullable(),
                worksheetId: z.number().nullable()
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
                operator: z.string()
            })
        }),
        z.object({
            message: z.string(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                operator: z.string()
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
        const worksheet = getWorksheet(cmd.args, workbook);

        const cfRule = worksheet.addConditionalFormatting(cmd.args.range);
        cfRule.addRule(cmd.args.rule);

        return {
            file: workbook,
            output: {
                message: `CellIs rule added`,
                range: cmd.args.range,
                rule: {
                    type: cmd.args.rule.type,
                    operator: cmd.args.rule.operator
                }
            }
        };
    },
);
