import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const commentProtectionTool = new FileBasedTool(
    "comment_protection",
    "Protect comment text and objects.",
    z.codec(
        z.object({
            cellReference: z.string(),
            lockText: z.boolean().optional(),
            hide: z.boolean().optional()
        }),
        z.object({
            cell: z.string(),
            lockText: z.boolean().nullable(),
            hide: z.boolean().nullable()
        }),
        {
            decode: (args) => ({
                cell: args.cellReference,
                lockText: args.lockText != undefined ? args.lockText : null,
                hide: args.hide != undefined ? args.hide : null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                lockText: value.lockText !== null ? value.lockText : undefined,
                hide: value.hide !== null ? value.hide : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            commentProtection: z.object({
                lockText: z.boolean(),
                hide: z.boolean()
            })
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            commentProtection: z.object({
                lockText: z.boolean(),
                hide: z.boolean()
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
        let worksheet = null;

        workbook.eachSheet((ws) => {
            if (worksheet === null) {
                worksheet = ws;
            }
        });

        if (!worksheet) {
            throw new Error("No worksheet found");
        }

        const cellRef = cmd.args.cellReference;
        const cell = worksheet.getCell(cellRef);
        const comment = cell.comment;

        if (!comment) {
            throw new Error(`No comment found for cell ${cellRef}`);
        }

        if (cmd.args.lockText != undefined) {
            comment.protection.lockText = cmd.args.lockText;
        }
        if (cmd.args.hide != undefined) {
            comment.protection.hide = cmd.args.hide;
        }

        return {
            file: workbook,
            output: {
                message: `Comment protection updated for cell ${cellRef}`,
                cellReference: cellRef,
                commentProtection: {
                    lockText: comment.protection.lockText,
                    hide: comment.protection.hide
                }
            }
        };
    },
);