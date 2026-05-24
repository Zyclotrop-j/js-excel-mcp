import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const conditionalFormattingTool = new FileBasedTool(
    "conditional_formatting",
    "Apply dynamic formatting based on rules.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            range: z.string(),
            rules: z.array(z.object({
                type: z.string(),
                priority: z.number().optional(),
                stopIfTrue: z.boolean().optional(),
                style: z.object({
                    font: z.object({
                        color: z.object({ argb: z.string().optional() }).optional()
                    }).optional(),
                    fill: z.object({
                        fgColor: z.object({ argb: z.string().optional() }).optional()
                    }).optional()
                }).optional()
            }))
        }),
        z.object({
            sheet: z.string().nullable(),
            range: z.string(),
            rules: z.array(z.object({
                type: z.string(),
                priority: z.number().nullable(),
                stopIfTrue: z.boolean().nullable(),
                style: z.object({
                    font: z.object({
                        color: z.object({ argb: z.string().nullable() }).nullable()
                    }).nullable(),
                    fill: z.object({
                        fgColor: z.object({ argb: z.string().nullable() }).nullable()
                    }).nullable()
                }).nullable()
            })).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                range: args.range,
                rules: args.rules || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                range: value.range,
                rules: value.rules || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            range: z.string(),
            ruleCount: z.number()
        }),
        z.object({
            message: z.string(),
            range: z.string(),
            ruleCount: z.number()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        let worksheet = null;
        
        if (cmd.args.worksheetName) {
            worksheet = workbook.getWorksheet(cmd.args.worksheetName);
        } else if (cmd.args.worksheetId !== undefined) {
            workbook.eachSheet((ws, sheetId) => {
                if (sheetId === cmd.args.worksheetId) {
                    worksheet = ws;
                }
            });
        } else {
            worksheet = workbook.getWorksheet(1);
        }

        if (!worksheet) {
            throw new Error(`Worksheet not found`);
        }

        const cfRule = worksheet.addConditionalFormatting(cmd.args.range);
        cmd.args.rules.forEach(rule => {
            cfRule.addRule(rule);
        });

        return {
            file: workbook,
            output: {
                message: `Conditional formatting applied`,
                range: cmd.args.range,
                ruleCount: cmd.args.rules.length
            }
        };
    },
);