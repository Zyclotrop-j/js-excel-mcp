import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const bordersTool = new FileBasedTool(
    "borders",
    "Add cell borders with styles and colors.",
    z.codec(
        z.object({
            cellReference: z.string().meta({description: "Cell reference to apply borders to. Examples: \"A1\", \"B2\", \"C3:D10\""}),
            border: z.object({
                top: z.object({
                    style: z.string().meta({description: "Top border style. Examples: \"thin\", \"medium\", \"thick\", \"double\", \"dotted\", \"dashed\""}),
                    color: z.object({
                        argb: z.string().regex(/^[0-9A-F]{8}$/i).optional().meta({description: "ARGB color code for top border. Hex format: 8 characters. Range: 00000000 to FFFFFFFF. Examples: \"FF000000\" (black), \"FFFFFFFF\" (white)"}),
                        theme: z.number().min(0).max(65).optional().meta({description: "Theme color index for top border. Range: 0-65. Examples: 0 (none), 1 (black)"})
                    }).optional().meta({description: "Top border color. Either theme (number) or ARGB (hex string)"})
                }).optional().meta({description: "Top border configuration. Optional, omit to remove top border"}),
                bottom: z.object({
                    style: z.string().meta({description: "Bottom border style. Examples: \"thin\", \"medium\", \"thick\", \"double\", \"dotted\", \"dashed\""}),
                    color: z.object({
                        argb: z.string().regex(/^[0-9A-F]{8}$/i).optional().meta({description: "ARGB color code for bottom border. Hex format: 8 characters. Range: 00000000 to FFFFFFFF. Examples: \"FF000000\" (black), \"FFFFFFFF\" (white)"}),
                        theme: z.number().min(0).max(65).optional().meta({description: "Theme color index for bottom border. Range: 0-65. Examples: 0 (none), 1 (black)"})
                    }).optional().meta({description: "Bottom border color. Either theme (number) or ARGB (hex string)"})
                }).optional().meta({description: "Bottom border configuration. Optional, omit to remove bottom border"}),
                left: z.object({
                    style: z.string().meta({description: "Left border style. Examples: \"thin\", \"medium\", \"thick\", \"double\", \"dotted\", \"dashed\""}),
                    color: z.object({
                        argb: z.string().regex(/^[0-9A-F]{8}$/i).optional().meta({description: "ARGB color code for left border. Hex format: 8 characters. Range: 00000000 to FFFFFFFF. Examples: \"FF000000\" (black), \"FFFFFFFF\" (white)"}),
                        theme: z.number().min(0).max(65).optional().meta({description: "Theme color index for left border. Range: 0-65. Examples: 0 (none), 1 (black)"})
                    }).optional().meta({description: "Left border color. Either theme (number) or ARGB (hex string)"})
                }).optional().meta({description: "Left border configuration. Optional, omit to remove left border"}),
                right: z.object({
                    style: z.string().meta({description: "Right border style. Examples: \"thin\", \"medium\", \"thick\", \"double\", \"dotted\", \"dashed\""}),
                    color: z.object({
                        argb: z.string().regex(/^[0-9A-F]{8}$/i).optional().meta({description: "ARGB color code for right border. Hex format: 8 characters. Range: 00000000 to FFFFFFFF. Examples: \"FF000000\" (black), \"FFFFFFFF\" (white)"}),
                        theme: z.number().min(0).max(65).optional().meta({description: "Theme color index for right border. Range: 0-65. Examples: 0 (none), 1 (black)"})
                    }).optional().meta({description: "Right border color. Either theme (number) or ARGB (hex string)"})
                }).optional().meta({description: "Right border configuration. Optional, omit to remove right border"}),
                diagonal: z.object({
                    style: z.string().meta({description: "Diagonal border style. Examples: \"thin\", \"medium\", \"thick\", \"double\", \"dotted\", \"dashed\""}),
                    color: z.object({
                        argb: z.string().regex(/^[0-9A-F]{8}$/i).optional().meta({description: "ARGB color code for diagonal border. Hex format: 8 characters. Range: 00000000 to FFFFFFFF. Examples: \"FF000000\" (black), \"FFFFFFFF\" (white)"}),
                        theme: z.number().min(0).max(65).optional().meta({description: "Theme color index for diagonal border. Range: 0-65. Examples: 0 (none), 1 (black)"})
                    }).optional().meta({description: "Diagonal border color. Either theme (number) or ARGB (hex string)"})
                }).optional().meta({description: "Diagonal border configuration. Optional, omit to remove diagonal border"})
            }).optional().meta({description: "Border configuration for all sides. Optional, omit to remove all borders"}),
            worksheetName: z.string().optional().meta({description: "Name of the worksheet. Examples: \"Sheet1\", \"Data\", \"Summary\""}),
            worksheetId: z.number().min(1).optional().meta({description: "ID of the worksheet. Positive integer starting from 1. Example: 1 (first sheet), 2 (second sheet)"})
        }).meta({description: "Configuration for setting cell borders with styles and colors"}),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            border: z.object({
                top: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
                bottom: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
                left: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
                right: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
                diagonal: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                border: args.border || undefined,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                border: value.border || null,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string().meta({description: "Success message describing the border update operation"}),
            cellReference: z.string().meta({description: "Reference to the cell that was updated. Examples: \"A1\", \"B2\""}),
            border: z.object({
                top: z.object({ style: z.string().nullable().meta({description: "Top border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable(),
                bottom: z.object({ style: z.string().nullable().meta({description: "Bottom border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable(),
                left: z.object({ style: z.string().nullable().meta({description: "Left border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable(),
                right: z.object({ style: z.string().nullable().meta({description: "Right border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable(),
                diagonal: z.object({ style: z.string().nullable().meta({description: "Diagonal border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable()
            }).meta({description: "Border styles that were applied to the cell"})
        }).meta({description: "Result of the border update operation with applied border styles"}),
        z.object({
            message: z.string().meta({description: "Success message describing the border update operation"}),
            cellReference: z.string().meta({description: "Reference to the cell that was updated. Examples: \"A1\", \"B2\""}),
            border: z.object({
                top: z.object({ style: z.string().nullable().meta({description: "Top border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable(),
                bottom: z.object({ style: z.string().nullable().meta({description: "Bottom border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable(),
                left: z.object({ style: z.string().nullable().meta({description: "Left border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable(),
                right: z.object({ style: z.string().nullable().meta({description: "Right border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable(),
                diagonal: z.object({ style: z.string().nullable().meta({description: "Diagonal border style that was applied. Examples: \"thin\", \"medium\", \"thick\""}) }).nullable()
            }).meta({description: "Border styles that were applied to the cell"})
        }).meta({description: "Result of the border update operation with applied border styles"}),
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
        cell.border = cmd.args.border;

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} border updated`,
                cellReference: cellRef,
                border: cmd.args.border
            }
        };
    },
);
