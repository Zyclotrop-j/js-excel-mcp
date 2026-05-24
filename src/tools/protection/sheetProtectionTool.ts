import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

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
                options: args.options || null
            }),
            encode: (value) => ({
                password: value.password || undefined,
                options: value.options || undefined
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
        let worksheet = null;

        // Find active worksheet
        workbook.eachSheet((ws) => {
            if (worksheet === null) {
                worksheet = ws;
            }
        });

        if (!worksheet) {
            throw new Error("No worksheet found");
        }

        // Apply protection
        if (cmd.args.password) {
            worksheet.protection.password = cmd.args.password;
        }
        if (cmd.args.options) {
            worksheet.protection.sheet = cmd.args.options.sheet != undefined ? cmd.args.options.sheet : worksheet.protection.sheet;
            worksheet.protection.structure = cmd.args.options.structure != undefined ? cmd.args.options.structure : worksheet.protection.structure;
            worksheet.protection.objects = cmd.args.options.objects != undefined ? cmd.args.options.objects : worksheet.protection.objects;
            worksheet.protection.scenarios = cmd.args.options.scenarios != undefined ? cmd.args.options.scenarios : worksheet.protection.scenarios;
            worksheet.protection.formatCells = cmd.args.options.formatCells != undefined ? cmd.args.options.formatCells : worksheet.protection.formatCells;
            worksheet.protection.formatColumns = cmd.args.options.formatColumns != undefined ? cmd.args.options.formatColumns : worksheet.protection.formatColumns;
            worksheet.protection.formatRows = cmd.args.options.formatRows != undefined ? cmd.args.options.formatRows : worksheet.protection.formatRows;
            worksheet.protection.insertColumns = cmd.args.options.insertColumns != undefined ? cmd.args.options.insertColumns : worksheet.protection.insertColumns;
            worksheet.protection.insertRows = cmd.args.options.insertRows != undefined ? cmd.args.options.insertRows : worksheet.protection.insertRows;
            worksheet.protection.insertHyperlinks = cmd.args.options.insertHyperlinks != undefined ? cmd.args.options.insertHyperlinks : worksheet.protection.insertHyperlinks;
            worksheet.protection.deleteColumns = cmd.args.options.deleteColumns != undefined ? cmd.args.options.deleteColumns : worksheet.protection.deleteColumns;
            worksheet.protection.deleteRows = cmd.args.options.deleteRows != undefined ? cmd.args.options.deleteRows : worksheet.protection.deleteRows;
            worksheet.protection.selectLockedCells = cmd.args.options.selectLockedCells != undefined ? cmd.args.options.selectLockedCells : worksheet.protection.selectLockedCells;
            worksheet.protection.selectUnlockedCells = cmd.args.options.selectUnlockedCells != undefined ? cmd.args.options.selectUnlockedCells : worksheet.protection.selectUnlockedCells;
            worksheet.protection.sort = cmd.args.options.sort != undefined ? cmd.args.options.sort : worksheet.protection.sort;
            worksheet.protection.autoFilter = cmd.args.options.autoFilter != undefined ? cmd.args.options.autoFilter : worksheet.protection.autoFilter;
            worksheet.protection.pivotTables = cmd.args.options.pivotTables != undefined ? cmd.args.options.pivotTables : worksheet.protection.pivotTables;
            worksheet.protection.editObjects = cmd.args.options.editObjects != undefined ? cmd.args.options.editObjects : worksheet.protection.editObjects;
            worksheet.protection.editScenarios = cmd.args.options.editScenarios != undefined ? cmd.args.options.editScenarios : worksheet.protection.editScenarios;
        }

        return {
            file: workbook,
            output: {
                message: `Successfully configured sheet protection for worksheet "${worksheet.name}"`,
                protectionStatus: {
                    protected: !!worksheet.protection.password,
                    password: worksheet.protection.password || null,
                    options: {
                        sheet: worksheet.protection.sheet,
                        structure: worksheet.protection.structure,
                        objects: worksheet.protection.objects,
                        scenarios: worksheet.protection.scenarios,
                        formatCells: worksheet.protection.formatCells,
                        formatColumns: worksheet.protection.formatColumns,
                        formatRows: worksheet.protection.formatRows,
                        insertColumns: worksheet.protection.insertColumns,
                        insertRows: worksheet.protection.insertRows,
                        insertHyperlinks: worksheet.protection.insertHyperlinks,
                        deleteColumns: worksheet.protection.deleteColumns,
                        deleteRows: worksheet.protection.deleteRows,
                        selectLockedCells: worksheet.protection.selectLockedCells,
                        selectUnlockedCells: worksheet.protection.selectUnlockedCells,
                        sort: worksheet.protection.sort,
                        autoFilter: worksheet.protection.autoFilter,
                        pivotTables: worksheet.protection.pivotTables,
                        editObjects: worksheet.protection.editObjects,
                        editScenarios: worksheet.protection.editScenarios
                    }
                }
            }
        };
    },
);