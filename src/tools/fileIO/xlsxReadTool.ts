import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const xlsxReadTool = new FileBasedTool(
    "xlsx_read",
    "Read Excel files with options and load into workbook.",
    z.codec(
        z.object({
            filename: z.string().optional(),
            password: z.string().optional(),
            sheets: z.boolean().optional(),
            sheetStubs: z.boolean().optional(),
            dateNF: z.string().optional(),
            cellDates: z.boolean().optional(),
            cellStyles: z.boolean().optional(),
            cellFormula: z.boolean().optional(),
            cellStylesXlsx: z.boolean().optional(),
            cellFormulaXlsx: z.boolean().optional(),
            cellNF: z.boolean().optional(),
            cellFormulaXlsxFormulas: z.boolean().optional()
        }),
        z.object({
            filename: z.string().nullable(),
            password: z.string().nullable(),
            sheets: z.boolean().nullable(),
            sheetStubs: z.boolean().nullable(),
            dateNF: z.string().nullable(),
            cellDates: z.boolean().nullable(),
            cellStyles: z.boolean().nullable(),
            cellFormula: z.boolean().nullable(),
            cellStylesXlsx: z.boolean().nullable(),
            cellFormulaXlsx: z.boolean().nullable(),
            cellNF: z.boolean().nullable(),
            cellFormulaXlsxFormulas: z.boolean().nullable()
        }),
        {
            decode: (args) => ({
                filename: args.filename || null,
                password: args.password || null,
                sheets: args.sheets != undefined ? args.sheets : null,
                sheetStubs: args.sheetStubs != undefined ? args.sheetStubs : null,
                dateNF: args.dateNF || null,
                cellDates: args.cellDates != undefined ? args.cellDates : null,
                cellStyles: args.cellStyles != undefined ? args.cellStyles : null,
                cellFormula: args.cellFormula != undefined ? args.cellFormula : null,
                cellStylesXlsx: args.cellStylesXlsx != undefined ? args.cellStylesXlsx : null,
                cellFormulaXlsx: args.cellFormulaXlsx != undefined ? args.cellFormulaXlsx : null,
                cellNF: args.cellNF != undefined ? args.cellNF : null,
                cellFormulaXlsxFormulas: args.cellFormulaXlsxFormulas != undefined ? args.cellFormulaXlsxFormulas : null
            }),
            encode: (value) => ({
                filename: value.filename || undefined,
                password: value.password || undefined,
                sheets: value.sheets !== null ? value.sheets : undefined,
                sheetStubs: value.sheetStubs !== null ? value.sheetStubs : undefined,
                dateNF: value.dateNF || undefined,
                cellDates: value.cellDates !== null ? value.cellDates : undefined,
                cellStyles: value.cellStyles !== null ? value.cellStyles : undefined,
                cellFormula: value.cellFormula !== null ? value.cellFormula : undefined,
                cellStylesXlsx: value.cellStylesXlsx !== null ? value.cellStylesXlsx : undefined,
                cellFormulaXlsx: value.cellFormulaXlsx !== null ? value.cellFormulaXlsx : undefined,
                cellNF: value.cellNF !== null ? value.cellNF : undefined,
                cellFormulaXlsxFormulas: value.cellFormulaXlsxFormulas !== null ? value.cellFormulaXlsxFormulas : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetCount: z.number(),
            sheetNames: z.array(z.string())
        }),
        z.object({
            message: z.string(),
            worksheetCount: z.number(),
            sheetNames: z.array(z.string())
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const args = cmd.args;
        
        if (!args.filename) {
            throw new Error('filename is required');
        }

        const workbook = new ExcelJS.Workbook();
        
        await workbook.xlsx.readFile(args.filename, {
            password: args.password,
            sheets: args.sheets,
            sheetStubs: args.sheetStubs,
            dateNF: args.dateNF,
            cellDates: args.cellDates,
            cellStyles: args.cellStyles,
            cellFormula: args.cellFormula,
            cellStylesXlsx: args.cellStylesXlsx,
            cellFormulaXlsx: args.cellFormulaXlsx,
            cellNF: args.cellNF,
            cellFormulaXlsxFormulas: args.cellFormulaXlsxFormulas
        });

        return {
            file: workbook,
            output: {
                message: `Successfully read file ${args.filename}`,
                worksheetCount: workbook.worksheetNames.length,
                sheetNames: workbook.worksheetNames
            }
        };
    },
);