import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const setWorkbookPropertiesTool = new FileBasedTool(
    "set_workbook_properties",
    "Set workbook properties like creator, dates, metadata, and calculation properties.",
    z.codec(
        z.object({
            title: z.string().optional(),
            subject: z.string().optional(),
            keywords: z.string().optional(),
            category: z.string().optional(),
            description: z.string().optional(),
            company: z.string().optional(),
            manager: z.string().optional(),
            creator: z.string().optional(),
            created: z.string().optional(),
            modified: z.string().optional(),
            calcProperties: z.object({
                fullCalcOnLoad: z.boolean().optional()
            }).optional(),
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
            })).optional()
        }),
        z.object({
            title: z.string().nullable(),
            subject: z.string().nullable(),
            keywords: z.string().nullable(),
            category: z.string().nullable(),
            description: z.string().nullable(),
            company: z.string().nullable(),
            manager: z.string().nullable(),
            creator: z.string().nullable(),
            created: z.string().nullable(),
            modified: z.string().nullable(),
            calcProperties: z.object({
                fullCalcOnLoad: z.boolean().optional()
            }).nullable(),
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
            })).nullable()
        }),
        {
            decode: (args) => ({
                title: args.title || null,
                subject: args.subject || null,
                keywords: args.keywords || null,
                category: args.category || null,
                description: args.description || null,
                company: args.company || null,
                manager: args.manager || null,
                creator: args.creator || null,
                created: args.created || null,
                modified: args.modified || null,
                calcProperties: args.calcProperties || null,
                views: args.views || null
            }),
            encode: (value) => ({
                title: value.title || undefined,
                subject: value.subject || undefined,
                keywords: value.keywords || undefined,
                category: value.category || undefined,
                description: value.description || undefined,
                company: value.company || undefined,
                manager: value.manager || undefined,
                creator: value.creator || undefined,
                created: value.created || undefined,
                modified: value.modified || undefined,
                calcProperties: value.calcProperties || undefined,
                views: value.views || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            updatedProperties: z.object({
                title: z.string().nullable(),
                subject: z.string().nullable(),
                keywords: z.string().nullable(),
                category: z.string().nullable(),
                description: z.string().nullable(),
                company: z.string().nullable(),
                manager: z.string().nullable(),
                creator: z.string().nullable(),
                created: z.string().nullable(),
                modified: z.string().nullable(),
                calcProperties: z.object({
                    fullCalcOnLoad: z.boolean().optional()
                }).nullable(),
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
                })).nullable()
            }),
                sheetCount: z.number()
        }),
        z.object({
            message: z.string(),
            updatedProperties: z.object({
                title: z.string().nullable(),
                subject: z.string().nullable(),
                keywords: z.string().nullable(),
                category: z.string().nullable(),
                description: z.string().nullable(),
                company: z.string().nullable(),
                manager: z.string().nullable(),
                creator: z.string().nullable(),
                created: z.string().nullable(),
                modified: z.string().nullable(),
                calcProperties: z.object({
                    fullCalcOnLoad: z.boolean().optional()
                }).nullable(),
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
                })).nullable()
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
        const workbook = cmd.file;
        
        // Set properties if provided
        if (cmd.args.title) workbook.title = cmd.args.title;
        if (cmd.args.subject) workbook.subject = cmd.args.subject;
        if (cmd.args.keywords) workbook.keywords = cmd.args.keywords;
        if (cmd.args.category) workbook.category = cmd.args.category;
        if (cmd.args.description) workbook.description = cmd.args.description;
        if (cmd.args.company) workbook.company = cmd.args.company;
        if (cmd.args.manager) workbook.manager = cmd.args.manager;
        if (cmd.args.creator) workbook.creator = cmd.args.creator;
        if (cmd.args.created) workbook.created = new Date(cmd.args.created);
        if (cmd.args.modified) workbook.modified = new Date(cmd.args.modified);
        if (cmd.args.calcProperties) {
            workbook.calcProperties.fullCalcOnLoad = cmd.args.calcProperties.fullCalcOnLoad;
        }
        if (cmd.args.views) {
            workbook.views = cmd.args.views.map(view => ({
                ...view,
                state: view.state === 'sheetViewFrozen' ? 'sheetViewFrozen' : 
                       view.state === 'sheetViewFrozenSplit' ? 'sheetViewFrozenSplit' : 'normal'
            }));
        }

        return {
            file: workbook,
            output: {
                message: 'Successfully updated workbook properties',
                updatedProperties: {
                    title: workbook.title || null,
                    subject: workbook.subject || null,
                    keywords: workbook.keywords || null,
                    category: workbook.category || null,
                    description: workbook.description || null,
                    company: workbook.company || null,
                    manager: workbook.manager || null,
                    creator: workbook.creator || null,
                    created: workbook.created ? workbook.created.toISOString() : null,
                    modified: workbook.modified ? workbook.modified.toISOString() : null,
                    calcProperties: workbook.calcProperties ? {
                        fullCalcOnLoad: workbook.calcProperties.fullCalcOnLoad
                    } : null,
                    views: workbook.views ? workbook.views.map(view => ({
                        ...view,
                        state: view.state
                    })) : null
                },
                sheetCount: workbook.worksheetNames.length
            }
        };
    },
);