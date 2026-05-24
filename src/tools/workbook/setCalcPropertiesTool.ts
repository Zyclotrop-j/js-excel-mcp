import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const setCalcPropertiesTool = new FileBasedTool(
    "set_calc_properties",
    "Configure calculation behavior on load for the workbook.",
    z.codec(
        z.object({
            fullCalcOnLoad: z.boolean().optional(),
            date1904: z.boolean().optional()
        }),
        z.object({
            fullCalcOnLoad: z.boolean().nullable(),
            date1904: z.boolean().nullable()
        }),
        {
            decode: (args) => ({
                fullCalcOnLoad: args.fullCalcOnLoad != undefined ? args.fullCalcOnLoad : null,
                date1904: args.date1904 != undefined ? args.date1904 : null
            }),
            encode: (value) => ({
                fullCalcOnLoad: value.fullCalcOnLoad !== null ? value.fullCalcOnLoad : undefined,
                date1904: value.date1904 !== null ? value.date1904 : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            calculationProperties: z.object({
                fullCalcOnLoad: z.boolean(),
                date1904: z.boolean()
            }),
                sheetCount: z.number()
        }),
        z.object({
            message: z.string(),
            calculationProperties: z.object({
                fullCalcOnLoad: z.boolean(),
                date1904: z.boolean()
            }),
            sheetCount: z.number()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        
        // Set calculation properties if provided
        if (cmd.args.fullCalcOnLoad != undefined) {
            workbook.calcProperties.fullCalcOnLoad = cmd.args.fullCalcOnLoad;
        }
        if (cmd.args.date1904 != undefined) {
            workbook.properties.date1904 = cmd.args.date1904;
        }

        return {
            file: workbook,
            output: {
                message: 'Successfully updated calculation properties',
                calculationProperties: {
                    fullCalcOnLoad: workbook.calcProperties.fullCalcOnLoad,
                    date1904: workbook.properties.date1904 || false
                },
                sheetCount: workbook.worksheetNames.length
            }
        };
    },
);