import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const hyperlinkValueTool = new FileBasedTool(
    "hyperlink_value",
    "Create clickable links with text and tooltip.",
    z.codec(
        z.object({
            cellReference: z.string(),
            text: z.string(),
            hyperlink: z.string(),
            tooltip: z.string().optional(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().min(1).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            text: z.string(),
            hyperlink: z.string(),
            tooltip: z.string().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                text: args.text,
                hyperlink: args.hyperlink,
                tooltip: args.tooltip || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                text: value.text,
                hyperlink: value.hyperlink,
                tooltip: value.tooltip || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            hyperlink: z.object({
                text: z.string(),
                hyperlink: z.string(),
                tooltip: z.string().nullable()
            })
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            hyperlink: z.object({
                text: z.string(),
                hyperlink: z.string(),
                tooltip: z.string().nullable()
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

        const cellRef = cmd.args.cellReference;
        const cell = worksheet.getCell(cellRef);
        cell.value = {
            text: cmd.args.text,
            hyperlink: cmd.args.hyperlink,
            tooltip: cmd.args.tooltip || cmd.args.text
        };

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} set to hyperlink`,
                cellReference: cellRef,
                hyperlink: {
                    text: cmd.args.text,
                    hyperlink: cmd.args.hyperlink,
                    tooltip: cmd.args.tooltip || cmd.args.text
                }
            }
        };
    },
);