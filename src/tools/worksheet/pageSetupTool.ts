import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const pageSetupTool = new FileBasedTool(
    "page_setup",
    "Configure print settings, margins, orientation, and page layout options.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
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
            blackAndWhite: z.boolean().optional(),
            draft: z.boolean().optional(),
            cellComments: z.enum(['none', 'asDisplayed', 'atEnd']).optional(),
            errors: z.enum(['displayed', 'blank', '--', '#NA']).optional(),
            printArea: z.string().optional(),
            printTitles: z.object({
                reference: z.string(),
                title: z.enum(['row', 'col'])
            }).optional(),
            rowBreaks: z.array(z.number()).optional(),
            colBreaks: z.array(z.number()).optional()
        }),
        z.object({
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable(),
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
            blackAndWhite: z.boolean().nullable(),
            draft: z.boolean().nullable(),
            cellComments: z.enum(['none', 'asDisplayed', 'atEnd']).nullable(),
            errors: z.enum(['displayed', 'blank', '--', '#NA']).nullable(),
            printArea: z.string().nullable(),
            printTitles: z.object({
                reference: z.string(),
                title: z.enum(['row', 'col'])
            }).nullable(),
            rowBreaks: z.array(z.number()).nullable(),
            colBreaks: z.array(z.number()).nullable()
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null,
                orientation: args.orientation || null,
                margins: args.margins || null,
                paperSize: args.paperSize != undefined ? args.paperSize : null,
                scale: args.scale != undefined ? args.scale : null,
                fitToPage: args.fitToPage != undefined ? args.fitToPage : null,
                fitToWidth: args.fitToWidth != undefined ? args.fitToWidth : null,
                fitToHeight: args.fitToHeight != undefined ? args.fitToHeight : null,
                blackAndWhite: args.blackAndWhite != undefined ? args.blackAndWhite : null,
                draft: args.draft != undefined ? args.draft : null,
                cellComments: args.cellComments || null,
                errors: args.errors || null,
                printArea: args.printArea || null,
                printTitles: args.printTitles || null,
                rowBreaks: args.rowBreaks || null,
                colBreaks: args.colBreaks || null
            }),
            encode: (value) => ({
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId !== null ? value.worksheetId : undefined,
                orientation: value.orientation || undefined,
                margins: value.margins || undefined,
                paperSize: value.paperSize !== null ? value.paperSize : undefined,
                scale: value.scale !== null ? value.scale : undefined,
                fitToPage: value.fitToPage !== null ? value.fitToPage : undefined,
                fitToWidth: value.fitToWidth !== null ? value.fitToWidth : undefined,
                fitToHeight: value.fitToHeight !== null ? value.fitToHeight : undefined,
                blackAndWhite: value.blackAndWhite !== null ? value.blackAndWhite : undefined,
                draft: value.draft !== null ? value.draft : undefined,
                cellComments: value.cellComments || undefined,
                errors: value.errors || undefined,
                printArea: value.printArea || undefined,
                printTitles: value.printTitles || undefined,
                rowBreaks: value.rowBreaks || undefined,
                colBreaks: value.colBreaks || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            pageSetup: z.object({
                orientation: z.enum(['portrait', 'landscape']).nullable(),
                margins: z.object({
                    left: z.number().nullable(),
                    right: z.number().nullable(),
                    top: z.number().nullable(),
                    bottom: z.number().nullable(),
                    header: z.number().nullable()
                }).nullable(),
                paperSize: z.number().nullable(),
                scale: z.number().nullable(),
                fitToPage: z.boolean().nullable(),
                fitToWidth: z.number().nullable(),
                fitToHeight: z.number().nullable(),
                blackAndWhite: z.boolean().nullable(),
                draft: z.boolean().nullable(),
                cellComments: z.enum(['none', 'asDisplayed', 'atEnd']).nullable(),
                errors: z.enum(['displayed', 'blank', '--', '#NA']).nullable(),
                printArea: z.string().nullable(),
                printTitles: z.object({
                    reference: z.string(),
                    title: z.enum(['row', 'col'])
                }).nullable(),
                rowBreaks: z.array(z.number()).nullable(),
                colBreaks: z.array(z.number()).nullable()
            })
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            pageSetup: z.object({
                orientation: z.enum(['portrait', 'landscape']).nullable(),
                margins: z.object({
                    left: z.number().nullable(),
                    right: z.number().nullable(),
                    top: z.number().nullable(),
                    bottom: z.number().nullable(),
                    header: z.number().nullable()
                }).nullable(),
                paperSize: z.number().nullable(),
                scale: z.number().nullable(),
                fitToPage: z.boolean().nullable(),
                fitToWidth: z.number().nullable(),
                fitToHeight: z.number().nullable(),
                blackAndWhite: z.boolean().nullable(),
                draft: z.boolean().nullable(),
                cellComments: z.enum(['none', 'asDisplayed', 'atEnd']).nullable(),
                errors: z.enum(['displayed', 'blank', '--', '#NA']).nullable(),
                printArea: z.string().nullable(),
                printTitles: z.object({
                    reference: z.string(),
                    title: z.enum(['row', 'col'])
                }).nullable(),
                rowBreaks: z.array(z.number()).nullable(),
                colBreaks: z.array(z.number()).nullable()
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
        const worksheet = getWorksheet(cmd.args, workbook, false);

        if (cmd.args.orientation) worksheet.pageSetup.orientation = cmd.args.orientation;
        if (cmd.args.margins) worksheet.pageSetup.margins = cmd.args.margins;
        if (cmd.args.paperSize != undefined) worksheet.pageSetup.paperSize = cmd.args.paperSize;
        if (cmd.args.scale != undefined) worksheet.pageSetup.scale = cmd.args.scale;
        if (cmd.args.fitToPage != undefined) worksheet.pageSetup.fitToPage = cmd.args.fitToPage;
        if (cmd.args.fitToWidth != undefined) worksheet.pageSetup.fitToWidth = cmd.args.fitToWidth;
        if (cmd.args.fitToHeight != undefined) worksheet.pageSetup.fitToHeight = cmd.args.fitToHeight;
        if (cmd.args.blackAndWhite != undefined) worksheet.pageSetup.blackAndWhite = cmd.args.blackAndWhite;
        if (cmd.args.draft != undefined) worksheet.pageSetup.draft = cmd.args.draft;
        if (cmd.args.cellComments != undefined) worksheet.pageSetup.cellComments = cmd.args.cellComments;
        if (cmd.args.errors != undefined) worksheet.pageSetup.errors = cmd.args.errors;
        if (cmd.args.printArea) worksheet.pageSetup.printArea = cmd.args.printArea;
        if (cmd.args.printTitles) {
            worksheet.pageSetup.printArea = cmd.args.printTitles.reference;
            worksheet.pageSetup.printTitle = cmd.args.printTitles.title;
        }
        if (cmd.args.rowBreaks) worksheet.pageSetup.rowBreaks = cmd.args.rowBreaks;
        if (cmd.args.colBreaks) worksheet.pageSetup.colBreaks = cmd.args.colBreaks;

        return {
            file: workbook,
            output: {
                message: `Page setup configured for worksheet "${worksheet.name}"`,
                worksheetName: worksheet.name,
                worksheetId: worksheet.id,
                pageSetup: {
                    orientation: worksheet.pageSetup.orientation,
                    margins: worksheet.pageSetup.margins,
                    paperSize: worksheet.pageSetup.paperSize,
                    scale: worksheet.pageSetup.scale,
                    fitToPage: worksheet.pageSetup.fitToPage,
                    fitToWidth: worksheet.pageSetup.fitToWidth,
                    fitToHeight: worksheet.pageSetup.fitToHeight,
                    blackAndWhite: worksheet.pageSetup.blackAndWhite,
                    draft: worksheet.pageSetup.draft,
                    cellComments: worksheet.pageSetup.cellComments,
                    errors: worksheet.pageSetup.errors,
                    printArea: worksheet.pageSetup.printArea,
                    printTitles: {
                        reference: worksheet.pageSetup.printArea,
                        title: worksheet.pageSetup.printTitle
                    },
                    rowBreaks: worksheet.pageSetup.rowBreaks,
                    colBreaks: worksheet.pageSetup.colBreaks
                }
            }
        };
    },
);