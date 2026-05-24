import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const addWorksheetTool = new FileBasedTool(
    "add_worksheet",
    "Create new worksheets with options including name, properties, and views.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            properties: z.object({
                tabColor: z.string().optional(),
                defaultRowHeight: z.number().optional(),
                defaultColWidth: z.number().optional(),
                outlineLevelCol: z.number().optional(),
                outlineLevelRow: z.number().optional()
            }).optional(),
            views: z.array(z.object({
                state: z.enum(['normal', 'frozen', 'split']),
                ySplit: z.number().optional(),
                xSplit: z.number().optional(),
                topLeftCell: z.string().optional(),
                activeCell: z.string().optional(),
                selection: z.object({
                    sqref: z.string()
                }).optional()
            })).optional(),
            pageSetup: z.object({
                orientation: z.enum(['portrait', 'landscape']).optional(),
                margins: z.object({
                    left: z.number().optional(),
                    right: z.number().optional(),
                    top: z.number().optional(),
                    bottom: z.number().optional(),
                    header: z.number().optional(),
                    footer: z.number().optional()
                }).optional(),
                paperSize: z.number().optional(),
                scale: z.number().optional(),
                fitToPage: z.boolean().optional(),
                fitToWidth: z.number().optional(),
                fitToHeight: z.number().optional(),
                startPage: z.number().optional(),
                endPage: z.number().optional(),
                differentFirstPage: z.boolean().optional(),
                differentOddEven: z.boolean().optional(),
                blackAndWhite: z.boolean().optional(),
                draft: z.boolean().optional(),
                cellComments: z.enum(['none', 'asDisplayed', 'atEnd']).optional(),
                errors: z.enum(['displayed', 'blank', '--', '#NA']).optional(),
                horizontalDpi: z.number().optional(),
                verticalDpi: z.number().optional(),
                rowBreaks: z.array(z.number()).optional(),
                colBreaks: z.array(z.number()).optional(),
                printArea: z.string().optional(),
                printTitles: z.object({
                    reference: z.string(),
                    title: z.enum(['row', 'col'])
                }).optional()
            }).optional(),
            headerFooter: z.object({
                differentFirst: z.boolean().optional(),
                differentOddEven: z.boolean().optional(),
                oddHeader: z.string().optional(),
                oddFooter: z.string().optional(),
                evenHeader: z.string().optional(),
                evenFooter: z.string().optional(),
                firstHeader: z.string().optional(),
                firstFooter: z.string().optional()
            }).optional()
        }),
        z.object({
            worksheetName: z.string().nullable(),
            properties: z.object({
                tabColor: z.string().nullable(),
                defaultRowHeight: z.number().nullable(),
                defaultColWidth: z.number().nullable(),
                outlineLevelCol: z.number().nullable(),
                outlineLevelRow: z.number().nullable()
            }).nullable(),
            views: z.array(z.object({
                state: z.enum(['normal', 'frozen', 'split']),
                ySplit: z.number().nullable(),
                xSplit: z.number().nullable(),
                topLeftCell: z.string().nullable(),
                activeCell: z.string().nullable(),
                selection: z.object({
                    sqref: z.string()
                }).nullable()
            })).nullable(),
            pageSetup: z.object({
                orientation: z.enum(['portrait', 'landscape']).nullable(),
                margins: z.object({
                    left: z.number().nullable(),
                    right: z.number().nullable(),
                    top: z.number().nullable(),
                    bottom: z.number().nullable(),
                    header: z.number().nullable(),
                    footer: z.number().nullable()
                }).nullable(),
                paperSize: z.number().nullable(),
                scale: z.number().nullable(),
                fitToPage: z.boolean().nullable(),
                fitToWidth: z.number().nullable(),
                fitToHeight: z.number().nullable(),
                startPage: z.number().nullable(),
                endPage: z.number().nullable(),
                differentFirstPage: z.boolean().nullable(),
                differentOddEven: z.boolean().nullable(),
                blackAndWhite: z.boolean().nullable(),
                draft: z.boolean().nullable(),
                cellComments: z.enum(['none', 'asDisplayed', 'atEnd']).nullable(),
                errors: z.enum(['displayed', 'blank', '--', '#NA']).nullable(),
                horizontalDpi: z.number().nullable(),
                verticalDpi: z.number().nullable(),
                rowBreaks: z.array(z.number()).nullable(),
                colBreaks: z.array(z.number()).nullable(),
                printArea: z.string().nullable(),
                printTitles: z.object({
                    reference: z.string(),
                    title: z.enum(['row', 'col'])
                }).nullable()
            }).nullable(),
            headerFooter: z.object({
                differentFirst: z.boolean().nullable(),
                differentOddEven: z.boolean().nullable(),
                oddHeader: z.string().nullable(),
                oddFooter: z.string().nullable(),
                evenHeader: z.string().nullable(),
                evenFooter: z.string().nullable(),
                firstHeader: z.string().nullable(),
                firstFooter: z.string().nullable()
            }).nullable()
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                properties: args.properties || null,
                views: args.views || null,
                pageSetup: args.pageSetup || null,
                headerFooter: args.headerFooter || null
            }),
            encode: (value) => ({
                worksheetName: value.worksheetName || undefined,
                properties: value.properties || undefined,
                views: value.views || undefined,
                pageSetup: value.pageSetup || undefined,
                headerFooter: value.headerFooter || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            properties: z.object({
                tabColor: z.string().nullable(),
                defaultRowHeight: z.number().nullable(),
                defaultColWidth: z.number().nullable(),
                outlineLevelCol: z.number().nullable(),
                outlineLevelRow: z.number().nullable()
            }).nullable(),
            totalSheets: z.number()
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            properties: z.object({
                tabColor: z.string().nullable(),
                defaultRowHeight: z.number().nullable(),
                defaultColWidth: z.number().nullable(),
                outlineLevelCol: z.number().nullable(),
                outlineLevelRow: z.number().nullable()
            }).nullable(),
            totalSheets: z.number()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        
        // Create worksheet with name if provided, otherwise default
        const worksheetName = cmd.args.worksheetName || `Sheet${workbook.worksheetNames.length + 1}`;
        const worksheet = workbook.addWorksheet(worksheetName);

        // Set properties if provided
        if (cmd.args.properties) {
            if (cmd.args.properties.tabColor) {
                worksheet.properties.tabColor = { argb: cmd.args.properties.tabColor };
            }
            if (cmd.args.properties.defaultRowHeight) {
                worksheet.properties.defaultRowHeight = cmd.args.properties.defaultRowHeight;
            }
            if (cmd.args.properties.defaultColWidth) {
                worksheet.properties.defaultColWidth = cmd.args.properties.defaultColWidth;
            }
            if (cmd.args.properties.outlineLevelCol) {
                worksheet.properties.outlineLevelCol = cmd.args.properties.outlineLevelCol;
            }
            if (cmd.args.properties.outlineLevelRow) {
                worksheet.properties.outlineLevelRow = cmd.args.properties.outlineLevelRow;
            }
        }

        // Set views if provided
        if (cmd.args.views) {
            cmd.args.views.forEach(view => {
                worksheet.views.push({
                    state: view.state,
                    ySplit: view.ySplit,
                    xSplit: view.xSplit,
                    topLeftCell: view.topLeftCell,
                    activeCell: view.activeCell,
                    selection: view.selection
                });
            });
        }

        // Set page setup if provided
        if (cmd.args.pageSetup) {
            const pageSetup = cmd.args.pageSetup;
            if (pageSetup.orientation) {
                worksheet.pageSetup.orientation = pageSetup.orientation;
            }
            if (pageSetup.margins) {
                worksheet.pageSetup.margins = pageSetup.margins;
            }
            if (pageSetup.paperSize) {
                worksheet.pageSetup.paperSize = pageSetup.paperSize;
            }
            if (pageSetup.scale) {
                worksheet.pageSetup.scale = pageSetup.scale;
            }
            // Add other page setup properties as needed
        }

        // Set header/footer if provided
        if (cmd.args.headerFooter) {
            Object.assign(worksheet.headerFooter, cmd.args.headerFooter);
        }

        return {
            file: workbook,
            output: {
                message: `Successfully added worksheet "${worksheetName}"`,
                worksheetName,
                worksheetId: workbook.worksheets.indexOf(worksheet) + 1,
                properties: worksheet.properties ? {
                    tabColor: worksheet.properties.tabColor?.argb || null,
                    defaultRowHeight: worksheet.properties.defaultRowHeight || null,
                    defaultColWidth: worksheet.properties.defaultColWidth || null,
                    outlineLevelCol: worksheet.properties.outlineLevelCol || null,
                    outlineLevelRow: worksheet.properties.outlineLevelRow || null
                } : null,
                totalSheets: workbook.worksheetNames.length
            }
        };
    },
);