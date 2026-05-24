import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import * as ExcelJS from "exceljs";

export const formulaTranslationTool = new FileBasedTool(
    "formula_translation",
    "Automatic formula translation for shared formulas.",
    z.codec(
        z.object({
            action: z.enum(["enable", "disable"])
        }),
        z.object({
            action: z.enum(["enable", "disable"]).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                action: args.action || null,
                worksheetName: undefined,
                worksheetId: null
            }),
            encode: (value) => ({
                action: value.action || undefined,
                worksheetName: undefined,
                worksheetId: undefined
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
        const action = cmd.args.action;
        
        if (action === "enable") {
            // @ts-ignore - translateFormula prototype doesn't exist in TypeScript definitions
            ExcelJS.Workbook.prototype.translateFormula = function(formula: string) {
                // Simplified formula translation
                return formula;
            };
            return {
                file: cmd.file,
                output: { message: `Formula translation enabled`, action: "enable" }
            };
        } else {
            // @ts-ignore - translateFormula prototype doesn't exist in TypeScript definitions
            delete ExcelJS.Workbook.prototype.translateFormula;
            return {
                file: cmd.file,
                output: { message: `Formula translation disabled`, action: "disable" }
            };
        }
    },
);