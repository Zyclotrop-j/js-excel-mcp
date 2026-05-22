import { FileBasedTool } from "./toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser, parseExcelReference, formatExcelReference } from "../services/excelutils.js";
import { cellValue, cellValueInverse, excelCellReferenceSchema } from "../services/exceltypes.js";

export const modifyCellTool = new FileBasedTool(
    "modifyCell",
    "Modifies a cell",
    z.codec(
        z.object({
            cellReference: excelCellReferenceSchema,
            newValue: cellValue
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            value: cellValueInverse
        }),
        {
            decode: (args) => ({
                ...parseExcelReference(args.cellReference),
                value: cellValue.encode(args.newValue)
            }),
            encode: (value) => ({
                cellReference: formatExcelReference(value),
                newValue: cellValueInverse.decode(value.value)
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string()
        }),
        z.object({
            message: z.string()
        }),
        {
            decode: (value) => ({ message: value.message }),
            encode: (value) => ({ message: value.message })
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const sheet = cmd.args.sheet ? cmd.file.getWorksheet(cmd.args.sheet) : cmd.file.getWorksheet(1);
        if (!sheet) throw new Error(`Sheet ${cmd.args.sheet} not found`);
        const cell = sheet.getCell(cmd.args.cell);
        cell.value = cmd.args.value;
        return {
            file: cmd.file,
            output: {
                message: `Cell ${cmd.args.cell} in sheet ${cmd.args.sheet || "ActiveSheet"} has been updated to ${JSON.stringify(cell.value)}`
            }
        };
    },
);
