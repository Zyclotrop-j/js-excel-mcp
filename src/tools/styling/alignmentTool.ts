import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const alignmentTool = new FileBasedTool(
    "alignment",
    "Set text alignment, wrapping, and rotation.",
    z.codec(
        z.object({
            cellReference: z.string(),
            alignment: z.object({
                horizontal: z.string().optional(),
                vertical: z.string().optional(),
                textRotation: z.number().optional(),
                wrapText: z.boolean().optional(),
                shrinkToFit: z.boolean().optional(),
                indent: z.number().optional()
            }),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            alignment: z.object({
                horizontal: z.string().nullable(),
                vertical: z.string().nullable(),
                textRotation: z.number().nullable(),
                wrapText: z.boolean().nullable(),
                shrinkToFit: z.boolean().nullable(),
                indent: z.number().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                alignment: args.alignment || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                alignment: value.alignment || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            alignment: z.object({
                horizontal: z.string().nullable(),
                vertical: z.string().nullable(),
                wrapText: z.boolean().nullable()
            })
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            alignment: z.object({
                horizontal: z.string().nullable(),
                vertical: z.string().nullable(),
                wrapText: z.boolean().nullable()
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

        const cellRef = cmd.args.cellReference;
        const cell = worksheet.getCell(cellRef);

        if (cmd.args.alignment) {
            if (cmd.args.alignment.horizontal) cell.alignment.horizontal = cmd.args.alignment.horizontal;
            if (cmd.args.alignment.vertical) cell.alignment.vertical = cmd.args.alignment.vertical;
            if (cmd.args.alignment.textRotation !== undefined) cell.alignment.textRotation = cmd.args.alignment.textRotation;
            if (cmd.args.alignment.wrapText !== undefined) cell.alignment.wrapText = cmd.args.alignment.wrapText;
            if (cmd.args.alignment.shrinkToFit !== undefined) cell.alignment.shrinkToFit = cmd.args.alignment.shrinkToFit;
            if (cmd.args.alignment.indent !== undefined) cell.alignment.indent = cmd.args.alignment.indent;
        }

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} alignment updated`,
                cellReference: cellRef,
                alignment: {
                    horizontal: cell.alignment.horizontal,
                    vertical: cell.alignment.vertical,
                    wrapText: cell.alignment.wrapText
                }
            }
        };
    },
);
