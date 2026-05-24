import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import type { Worksheet } from "exceljs";

export const sheetProtectionTool = new FileBasedTool(
    "sheet_protection",
    "Protect entire worksheets with passwords.",
    z.codec(
        z.object({
            password: z.string().optional(),
            options: z.object({
                sheet: z.boolean().optional(),
                structure: z.boolean().optional(),
                objects: z.boolean().optional(),
                scenarios: z.boolean().optional(),
                formatCells: z.boolean().optional(),
                formatColumns: z.boolean().optional(),
                formatRows: z.boolean().optional(),
                insertColumns: z.boolean().optional(),
                insertRows: z.boolean().optional(),
                insertHyperlinks: z.boolean().optional(),
                deleteColumns: z.boolean().optional(),
                deleteRows: z.boolean().optional(),
                selectLockedCells: z.boolean().optional(),
                selectUnlockedCells: z.boolean().optional(),
                sort: z.boolean().optional(),
                autoFilter: z.boolean().optional(),
                pivotTables: z.boolean().optional(),
                editObjects: z.boolean().optional(),
                editScenarios: z.boolean().optional()
            }).optional()
        }),
        z.object({
            password: z.string().nullable(),
            options: z.object({
                sheet: z.boolean().nullable(),
                structure: z.boolean().nullable(),
                objects: z.boolean().nullable(),
                scenarios: z.boolean().nullable(),
                formatCells: z.boolean().nullable(),
                formatColumns: z.boolean().nullable(),
                formatRows: z.boolean().nullable(),
                insertColumns: z.boolean().nullable(),
                insertRows: z.boolean().nullable(),
                insertHyperlinks: z.boolean().nullable(),
                deleteColumns: z.boolean().nullable(),
                deleteRows: z.boolean().nullable(),
                selectLockedCells: z.boolean().nullable(),
                selectUnlockedCells: z.boolean().nullable(),
                sort: z.boolean().nullable(),
                autoFilter: z.boolean().nullable(),
                pivotTables: z.boolean().nullable(),
                editObjects: z.boolean().nullable(),
                editScenarios: z.boolean().nullable()
            }).nullable()
        }),
        {
            decode: (args) => ({
                password: args.password || null,
                options: args.options as any
            }),
            encode: (value) => ({
                password: value.password || undefined,
                options: value.options as any
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            protectionStatus: z.object({
                protected: z.boolean(),
                password: z.string().nullable(),
                options: z.object({
                    sheet: z.boolean(),
                    structure: z.boolean(),
                    objects: z.boolean(),
                    scenarios: z.boolean(),
                    formatCells: z.boolean(),
                    formatColumns: z.boolean(),
                    formatRows: z.boolean(),
                    insertColumns: z.boolean(),
                    insertRows: z.boolean(),
                    insertHyperlinks: z.boolean(),
                    deleteColumns: z.boolean(),
                    deleteRows: z.boolean(),
                    selectLockedCells: z.boolean(),
                    selectUnlockedCells: z.boolean(),
                    sort: z.boolean(),
                    autoFilter: z.boolean(),
                    pivotTables: z.boolean(),
                    editObjects: z.boolean(),
                    editScenarios: z.boolean()
                })
            })
        }),
        z.object({
            message: z.string(),
            protectionStatus: z.object({
                protected: z.boolean(),
                password: z.string().nullable(),
                options: z.object({
                    sheet: z.boolean(),
                    structure: z.boolean(),
                    objects: z.boolean(),
                    scenarios: z.boolean(),
                    formatCells: z.boolean(),
                    formatColumns: z.boolean(),
                    formatRows: z.boolean(),
                    insertColumns: z.boolean(),
                    insertRows: z.boolean(),
                    insertHyperlinks: z.boolean(),
                    deleteColumns: z.boolean(),
                    deleteRows: z.boolean(),
                    selectLockedCells: z.boolean(),
                    selectUnlockedCells: z.boolean(),
                    sort: z.boolean(),
                    autoFilter: z.boolean(),
                    pivotTables: z.boolean(),
                    editObjects: z.boolean(),
                    editScenarios: z.boolean()
                })
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
        let worksheet: any = null;

        // Find active worksheet
        workbook.eachSheet((ws: any) => {
            if (worksheet === null) {
                worksheet = ws;
            }
        });

        if (!worksheet) {
            throw new Error("No worksheet found");
        }

        // Apply protection
        if (cmd.args.password || cmd.args.options) {
            worksheet.protect(cmd.args.password || null, cmd.args.options || undefined);
        }

        return {
            file: workbook,
            output: {
                message: `Successfully configured sheet protection for worksheet "${worksheet.name}"`,
                protectionStatus: {
                    protected: !!cmd.args.password,
                    password: cmd.args.password || null,
                    options: {
                        sheet: cmd.args.options?.sheet || false,
                        structure: cmd.args.options?.structure || false,
                        objects: cmd.args.options?.objects || false,
                        scenarios: cmd.args.options?.scenarios || false,
                        formatCells: cmd.args.options?.formatCells || false,
                        formatColumns: cmd.args.options?.formatColumns || false,
                        formatRows: cmd.args.options?.formatRows || false,
                        insertColumns: cmd.args.options?.insertColumns || false,
                        insertRows: cmd.args.options?.insertRows || false,
                        insertHyperlinks: cmd.args.options?.insertHyperlinks || false,
                        deleteColumns: cmd.args.options?.deleteColumns || false,
                        deleteRows: cmd.args.options?.deleteRows || false,
                        selectLockedCells: cmd.args.options?.selectLockedCells || false,
                        selectUnlockedCells: cmd.args.options?.selectUnlockedCells || false,
                        sort: cmd.args.options?.sort || false,
                        autoFilter: cmd.args.options?.autoFilter || false,
                        pivotTables: cmd.args.options?.pivotTables || false,
                        editObjects: cmd.args.options?.editObjects || false,
                        editScenarios: cmd.args.options?.editScenarios || false
                    }
                }
            }
        };
    },
);