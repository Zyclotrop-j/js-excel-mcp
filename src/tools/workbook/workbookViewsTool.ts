import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const workbookViewsTool = new FileBasedTool(
    "workbook_views",
    "Control multiple workbook window views and display settings.",
    z.codec(
        z.object({
            views: z.array(z.object({
                x: z.number(),
                y: z.number(),
                scale: z.number(),
                state: z.enum(['normal', 'sheetViewFrozen', 'sheetViewFrozenSplit']),
                activeTab: z.number().optional(),
                showHorizontalScroll: z.boolean().optional(),
                showVerticalScroll: z.boolean().optional(),
                showSheetTabs: z.boolean().optional(),
                topLeftCell: z.string().optional(),
                colorId: z.number().optional()
            })),
            clearViews: z.boolean().optional()
        }),
        z.object({
            views: z.array(z.object({
                x: z.number(),
                y: z.number(),
                scale: z.number(),
                state: z.enum(['normal', 'sheetViewFrozen', 'sheetViewFrozenSplit']),
                activeTab: z.number().optional(),
                showHorizontalScroll: z.boolean().optional(),
                showVerticalScroll: z.boolean().optional(),
                showSheetTabs: z.boolean().optional(),
                topLeftCell: z.string().optional(),
                colorId: z.number().optional()
            })).nullable(),
            clearViews: z.boolean().nullable()
        }),
        {
            decode: (args) => ({
                views: args.views || null,
                clearViews: args.clearViews != undefined ? args.clearViews : null
            }),
            encode: (value) => ({
                views: value.views || undefined,
                clearViews: value.clearViews !== null ? value.clearViews : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            views: z.array(z.object({
                x: z.number(),
                y: z.number(),
                scale: z.number(),
                state: z.enum(['normal', 'sheetViewFrozen', 'sheetViewFrozenSplit']),
                activeTab: z.number().optional(),
                showHorizontalScroll: z.boolean().optional(),
                showVerticalScroll: z.boolean().optional(),
                showSheetTabs: z.boolean().optional(),
                topLeftCell: z.string().optional(),
                colorId: z.number().optional()
            })) | null,
            sheetCount: z.number()
        }),
        z.object({
            message: z.string(),
            views: z.array(z.object({
                x: z.number(),
                y: z.number(),
                scale: z.number(),
                state: z.enum(['normal', 'sheetViewFrozen', 'sheetViewFrozenSplit']),
                activeTab: z.number().optional(),
                showHorizontalScroll: z.boolean().optional(),
                showVerticalScroll: z.boolean().optional(),
                showSheetTabs: z.boolean().optional(),
                topLeftCell: z.string().optional(),
                colorId: z.number().optional()
            })) | null,
            sheetCount: z.number()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        
        if (cmd.args.clearViews) {
            workbook.views = [];
        } else if (cmd.args.views) {
            workbook.views = cmd.args.views.map(view => ({
                ...view,
                state: view.state === 'sheetViewFrozen' ? 'sheetViewFrozen' : 
                       view.state === 'sheetViewFrozenSplit' ? 'sheetViewFrozenSplit' : 'normal'
            }));
        }

        return {
            file: workbook,
            output: {
                message: 'Successfully updated workbook views',
                views: workbook.views ? workbook.views.map(view => ({
                    ...view,
                    state: view.state
                })) : null,
                sheetCount: workbook.worksheetNames.length
            }
        };
    },
);