import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const rowsTool = new FileBasedTool(
    "rows",
    "Add, insert, and manage rows in worksheets.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            action: z.enum(['add', 'insert', 'duplicate', 'splice', 'get', 'last']),
            data: z.array(z.object({
                key: z.string(),
                value: cellValue
            })).optional(),
            values: z.array(cellValue).optional(),
            position: z.number().optional(),
            count: z.number().optional(),
            style: z.enum(['i', 'i+', 'n', 'o', 'o+']).optional(),
            pos: z.number().optional()
        }),
        z.object({
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable(),
            action: z.enum(['add', 'insert', 'duplicate', 'splice', 'get', 'last']).nullable(),
            data: z.array(z.object({
                key: z.string(),
                value: cellValue
            })).nullable(),
            values: z.array(cellValue).nullable(),
            position: z.number().nullable(),
            count: z.number().nullable(),
            style: z.enum(['i', 'i+', 'n', 'o', 'o+']).nullable(),
            pos: z.number().nullable()
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null,
                action: args.action || null,
                data: args.data || null,
                values: args.values || null,
                position: args.position != undefined ? args.position : null,
                count: args.count != undefined ? args.count : null,
                style: args.style || null,
                pos: args.pos != undefined ? args.pos : null
            }),
            encode: (value) => ({
                action: value.action,
                position: value.position,
                count: value.count,
                values: value.values,
                style: value.style,
                pos: value.pos,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId !== null ? value.worksheetId : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            rowCount: z.number(),
            lastRowNumber: z.number().nullable(),
            rows: z.array(z.object({
                rowNumber: z.number(),
                values: z.array(cellValue),
                height: z.number().nullable()
            })).nullable()
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            rowCount: z.number(),
            lastRowNumber: z.number().nullable(),
            rows: z.array(z.object({
                rowNumber: z.number(),
                values: z.array(cellValue),
                height: z.number().nullable()
            })).nullable()
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

        let result = {};

        switch (cmd.args.action) {
            case 'add':
                if (cmd.args.data) {
                    const newRow = worksheet.addRow(cmd.args.data);
                    result = { addedRowNumber: newRow.number };
                } else if (cmd.args.values) {
                    const newRow = worksheet.addRow(cmd.args.values);
                    result = { addedRowNumber: newRow.number };
                }
                break;
            case 'insert':
                if (cmd.args.pos != undefined && (cmd.args.data || cmd.args.values)) {
                    const insertedRow = worksheet.insertRow(cmd.args.pos, cmd.args.data || cmd.args.values, cmd.args.style);
                    result = { insertedRowNumber: insertedRow.number };
                }
                break;
            case 'duplicate':
                if (cmd.args.pos != undefined) {
                    const row = worksheet.getRow(cmd.args.pos);
                    const newRow = row.duplicate();
                    newRow.commit();
                    result = { duplicatedRowNumber: newRow.number };
                }
                break;
            case 'splice':
                if (cmd.args.pos != undefined && cmd.args.count != undefined) {
                    const removedRows = worksheet.spliceRows(cmd.args.pos, cmd.args.count);
                    if (cmd.args.values) {
                        cmd.args.values.forEach((rowValues, index) => {
                            worksheet.addRow(rowValues, cmd.args.pos + index);
                        });
                    }
                    result = { removed: removedRows, splicedRows: true };
                }
                break;
            case 'get':
                if (cmd.args.pos != undefined) {
                    const row = worksheet.getRow(cmd.args.pos);
                    result = {
                        rowNumber: row.number,
                        values: row.values.map(v => v ? v.value : null),
                        height: row.height
                    };
                }
                break;
            case 'last':
                const lastRow = worksheet.lastRow;
                if (lastRow) {
                    result = {
                        rowNumber: lastRow.number,
                        values: lastRow.values.map(v => v ? v.value : null),
                        height: lastRow.height
                    };
                }
                break;
        }

        return {
            file: workbook,
            output: {
                message: `Row operation completed`,
                worksheetName: worksheet.name,
                worksheetId: worksheet.id,
                rowCount: worksheet.rowCount,
                lastRowNumber: worksheet.lastRow ? worksheet.lastRow.number : null,
                rows: result.rows || null
            }
        };
    },
);