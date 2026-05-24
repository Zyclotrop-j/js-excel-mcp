import { FileBasedTool } from "./toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser, parseExcelReference, formatExcelReference } from "../services/excelutils.js";
import { cellValue, cellValueInverse, excelCellReferenceSchema } from "../services/exceltypes.js";
import { getWorksheet } from "../services/getWorkSheet.js";

export const modifyCellTool = new FileBasedTool(
    "modifyCell", // name - make it expressive!
    "Modifies a cell in an Excel workbook", // description - make it expressive, include good examples, etc
    z.codec(
        z.object({ // LLM friendly input for this mcp tool. Ensure this is simple json types only (e.g., no date)
            cellReference: excelCellReferenceSchema.meta({description: "Cell reference to modify. Examples: \"A1\", \"B2\", \"C3:D10\""}),
            newValue: cellValue.meta({description: "New value for the cell. Can be number, string, boolean, date, formula, hyperlink, rich text, or error value"})
        }).meta({description: "Input parameters for modifying a cell value"}),
        z.object({ // Ideal representation to call exceljs functions
            sheet: z.string().nullable(), cell: z.string(),
            value: cellValueInverse
        }),
        {
            decode: (args) => ({ // conversion from llm friendly input to exceljs params ("Ideal representation")
                ...parseExcelReference(args.cellReference),
                value: cellValue.encode(args.newValue)
            }),
            encode: (value) => ({ // conversion from ideal representation to llm friendly output
                cellReference: formatExcelReference(value),
                newValue: cellValueInverse.decode(value.value)
            }),
        }
    ),
    z.codec(
        z.object({ // Return value from the exceljs
            message: z.string().meta({description: "Success message describing the cell modification"})
        }).meta({description: "Result of the cell modification operation"}),
        z.object({ // LLM friendly feedback to the tool-call
            message: z.string().meta({description: "Success message describing the cell modification"})
        }).meta({description: "Friendly feedback message for the tool call"}),
        {
            decode: (value) => ({ message: value.message }), // conversion from exceljs return value to llm friendly output
            encode: (value) => ({ message: value.message }) // conversion from llm friendly output to exceljs return value
        }
    ),
    ExcelFileSerialiser, // always use the ExcelFileSerialiser
    async (cmd, ctx) => { // use exceljs params (cmd.args) + cmd.file (always an exceljs workbook) to actually perform the action (the exceljs function). Return {file: <the excel js workbook>, output: exceljs output params}
        const worksheet = getWorksheet(cmd.args, cmd.file, false);
        if (!worksheet) throw new Error(`Sheet ${cmd.args.sheet} not found`);
        const cell = worksheet.getCell(cmd.args.cell);
        cell.value = cmd.args.value;
        return {
            file: cmd.file,
            output: {
                message: `Cell ${cmd.args.cell} in sheet ${cmd.args.sheet || "ActiveSheet"} has been updated to ${JSON.stringify(cell.value)}`
            }
        };
    },
);