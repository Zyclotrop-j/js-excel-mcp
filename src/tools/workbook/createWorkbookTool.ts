import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const createWorkbookTool = new FileBasedTool(
    "create_workbook",
    "Create a new Excel workbook with optional properties configuration.",
    z.codec(
        z.object({
            filename: z.string().optional(),
            creator: z.string().optional(),
            created: z.string().optional(),
            modified: z.string().optional(),
            calcProperties: z.object({
                fullCalcOnLoad: z.boolean().optional()
            }).optional()
        }),
        z.object({
            filename: z.string().nullable(),
            creator: z.string().nullable(),
            created: z.string().nullable(),
            modified: z.string().nullable(),
            calcProperties: z.object({
                fullCalcOnLoad: z.boolean().optional()
            }).nullable()
        }),
        {
            decode: (args) => ({
                filename: args.filename || null,
                creator: args.creator || null,
                created: args.created || null,
                modified: args.modified || null,
                calcProperties: args.calcProperties || null
            }),
            encode: (value) => ({
                filename: value.filename || undefined,
                creator: value.creator || undefined,
                created: value.created || undefined,
                modified: value.modified || undefined,
                calcProperties: value.calcProperties || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            filePath: z.string(),
            message: z.string(),
            workbookProperties: z.object({
                creator: z.string().nullable(),
                created: z.string().nullable(),
                modified: z.string().nullable(),
                calcProperties: z.object({
                    fullCalcOnLoad: z.boolean().optional()
                }).nullable()
            }),
                sheetCount: z.number()
        }),
        z.object({
            filePath: z.string(),
            message: z.string(),
            workbookProperties: z.object({
                creator: z.string().nullable(),
                created: z.string().nullable(),
                modified: z.string().nullable(),
                calcProperties: z.object({
                    fullCalcOnLoad: z.boolean().optional()
                }).nullable()
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
        // Create new workbook
        const workbook = new ExcelJS.Workbook();
        
        // Set properties if provided
        if (cmd.args.creator) {
            workbook.creator = cmd.args.creator;
        }
        if (cmd.args.created) {
            workbook.created = new Date(cmd.args.created);
        }
        if (cmd.args.modified) {
            workbook.modified = new Date(cmd.args.modified);
        }
        if (cmd.args.calcProperties) {
            workbook.calcProperties.fullCalcOnLoad = cmd.args.calcProperties.fullCalcOnLoad;
        }

        // Add a default sheet
        workbook.addWorksheet('Sheet1');

        return {
            file: workbook,
            output: {
                filePath: cmd.file ? cmd.file.name : cmd.args.filename || 'new_workbook.xlsx',
                message: 'Successfully created new workbook',
                workbookProperties: {
                    creator: workbook.creator || null,
                    created: workbook.created ? workbook.created.toISOString() : null,
                    modified: workbook.modified ? workbook.modified.toISOString() : null,
                    calcProperties: workbook.calcProperties ? {
                        fullCalcOnLoad: workbook.calcProperties.fullCalcOnLoad
                    } : null
                },
                sheetCount: workbook.worksheetNames.length
            }
        };
    },
);