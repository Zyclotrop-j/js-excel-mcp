import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const expressionRulesTool = new FileBasedTool(
    "expression_rules",
    "Custom formula-based formatting rules.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                formula: z.string().optional(),
                style: z.object({
                    font: z.object({
                        name: z.string().optional(),
                        size: z.number().optional(),
                        bold: z.boolean().optional(),
                        color: z.object({
                            argb: z.string().optional(),
                            theme: z.number().optional()
                        }).optional()
                    }).optional(),
                    fill: z.object({
                        type: z.string().optional(),
                        fgColor: z.object({
                            argb: z.string().optional(),
                            theme: z.number().optional()
                        }).optional(),
                        pattern: z.string().optional()
                    }).optional()
                }).optional()
            })
        }),
        z.object({
            sheet: z.string().nullable(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                formula: z.string().nullable(),
                style: z.object({
                    font: z.object({
                        name: z.string().nullable(),
                        size: z.number().nullable(),
                        bold: z.boolean().nullable(),
                        color: z.object({
                            argb: z.string().nullable(),
                            theme: z.number().nullable()
                        }).nullable()
                    }).nullable(),
                    fill: z.object({
                        type: z.string().nullable(),
                        fgColor: z.object({
                            argb: z.string().nullable(),
                            theme: z.number().nullable()
                        }).nullable(),
                        pattern: z.string().nullable()
                    }).nullable()
                }).nullable()
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
                formula: z.string().nullable()
            })
        }),
        z.object({
            message: z.string(),
            range: z.string(),
            rule: z.object({
                type: z.string(),
                formula: z.string().nullable()
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
        cfRule.addRule({
            type: cmd.args.rule.type,
            formula: cmd.args.rule.formula,
            style: cmd.args.rule.style
        });

        return {
            file: workbook,
            output: {
                message: `Conditional formatting rule added`,
                range: cmd.args.range,
                rule: {
                    type: cmd.args.rule.type,
                    formula: cmd.args.rule.formula
                }
            }
        };
    },
);
