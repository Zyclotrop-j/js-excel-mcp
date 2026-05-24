import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const fillsTool = new FileBasedTool(
    "fills",
    "Apply pattern and gradient fills to cells.",
    z.codec(
        z.object({
            cellReference: z.string().meta({description: "Cell reference to apply fill to. Examples: \"A1\", \"B2\", \"C3:D10\""}),
            fill: z.object({
                type: z.string().meta({description: "Fill type. Examples: \"solid\", \"pattern\", \"gradient\""}),
                fgColor: z.object({
                    argb: z.string().regex(/^[0-9A-F]{8}$/i).optional().meta({description: "ARGB color code for foreground color. Hex format: 8 characters. Range: 00000000 to FFFFFFFF. Examples: \"FF000000\" (black), \"FFFFFF00\" (yellow)"}),
                    theme: z.number().min(0).max(65).optional().meta({description: "Theme color index for foreground color. Range: 0-65. Examples: 0 (none), 1 (black), 3 (red)"})
                }).optional().meta({description: "Foreground color for the fill. Either theme (number) or ARGB (hex string)"}),
                pattern: z.string().optional().meta({description: "Fill pattern type. Examples: \"solid\", \"darkGray\", \"mediumGray\", \"lightGray\", \"gray125\", \"gray0625\", \"darkHorizontal\", \"darkVertical\", \"darkDown\", \"darkUp\", \"darkGrid\", \"darkTrellis\", \"lightHorizontal\", \"lightVertical\", \"lightDown\", \"lightUp\", \"lightGrid\", \"lightTrellis\", \"gray125\", \"gray0625\""}),
                bgColor: z.object({
                    argb: z.string().regex(/^[0-9A-F]{8}$/i).optional().meta({description: "ARGB color code for background color. Hex format: 8 characters. Range: 00000000 to FFFFFFFF. Examples: \"FFFFFFFF\" (white), \"FF0000FF\" (blue)"}),
                    theme: z.number().min(0).max(65).optional().meta({description: "Theme color index for background color. Range: 0-65. Examples: 0 (none), 2 (white), 4 (blue)"})
                }).optional().meta({description: "Background color for the fill. Either theme (number) or ARGB (hex string)"})
            }).meta({description: "Fill configuration for cell background"}),
            worksheetName: z.string().optional().meta({description: "Name of the worksheet. Examples: \"Sheet1\", \"Data\", \"Summary\""}),
            worksheetId: z.number().min(1).optional().meta({description: "ID of the worksheet. Positive integer starting from 1. Example: 1 (first sheet), 2 (second sheet)"})
        }).meta({description: "Configuration for applying pattern and gradient fills to cells"}),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            fill: z.object({
                type: z.string().nullable(),
                fgColor: z.object({
                    argb: z.string().nullable(),
                    theme: z.number().nullable()
                }).nullable(),
                pattern: z.string().nullable(),
                bgColor: z.object({
                    argb: z.string().nullable(),
                    theme: z.number().nullable()
                }).nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                fill: args.fill || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                fill: value.fill || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string().meta({description: "Success message describing the fill update operation"}),
            cellReference: z.string().meta({description: "Reference to the cell that was updated. Examples: \"A1\", \"B2\""}),
            fill: z.object({
                type: z.string().meta({description: "Fill type that was applied. Examples: \"solid\", \"pattern\", \"gradient\""}),
                pattern: z.string().nullable().meta({description: "Pattern type that was applied. Examples: \"solid\", \"darkGray\", \"mediumGray\", \"lightGray\""})
            }).meta({description: "Fill properties that were applied to the cell"})
        }).meta({description: "Result of the fill update operation with applied fill settings"}),
        z.object({
            message: z.string().meta({description: "Success message describing the fill update operation"}),
            cellReference: z.string().meta({description: "Reference to the cell that was updated. Examples: \"A1\", \"B2\""}),
            fill: z.object({
                type: z.string().meta({description: "Fill type that was applied. Examples: \"solid\", \"pattern\", \"gradient\""}),
                pattern: z.string().nullable().meta({description: "Pattern type that was applied. Examples: \"solid\", \"darkGray\", \"mediumGray\", \"lightGray\""})
            }).meta({description: "Fill properties that were applied to the cell"})
        }).meta({description: "Result of the fill update operation with applied fill settings"}),
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
        cell.fill = cmd.args.fill;

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} fill updated`,
                cellReference: cellRef,
                fill: cmd.args.fill
            }
        };
    },
);
