import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const worksheetPropertiesTool = new FileBasedTool(
    "worksheet_properties",
    "Set worksheet properties including tab color, outline levels, and dimensions.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            properties: z.object({
                tabColor: z.string().optional(),
                defaultRowHeight: z.number().optional(),
                defaultColWidth: z.number().optional(),
                outlineLevelCol: z.number().optional(),
                outlineLevelRow: z.number().optional(),
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
                    scale: z.number().optional()
                }).optional(),
                headerFooter: z.object({
                    oddHeader: z.string().optional(),
                    oddFooter: z.string().optional(),
                    evenHeader: z.string().optional(),
                    evenFooter: z.string().optional(),
                    firstHeader: z.string().optional(),
                    firstFooter: z.string().optional()
                }).optional(),
                autoFilter: z.string().nullable(),
                state: z.enum(['visible', 'hidden', 'veryHidden']).nullable()
            }).nullable()
        }),
        z.object({
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable(),
            properties: z.object({
                tabColor: z.string().nullable(),
                defaultRowHeight: z.number().nullable(),
                defaultColWidth: z.number().nullable(),
                outlineLevelCol: z.number().nullable(),
                outlineLevelRow: z.number().nullable(),
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
                    scale: z.number().nullable()
                }).nullable(),
                headerFooter: z.object({
                    oddHeader: z.string().nullable(),
                    oddFooter: z.string().nullable(),
                    evenHeader: z.string().nullable(),
                    evenFooter: z.string().nullable(),
                    firstHeader: z.string().nullable(),
                    firstFooter: z.string().nullable()
                }).nullable(),
                autoFilter: z.string().nullable(),
                state: z.enum(['visible', 'hidden', 'veryHidden']).nullable()
            }).nullable()
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null,
                properties: args.properties || null
            }),
            encode: (value) => ({
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId !== null ? value.worksheetId : undefined,
                properties: value.properties || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            updatedProperties: z.object({
                tabColor: z.string().nullable(),
                defaultRowHeight: z.number().nullable(),
                defaultColWidth: z.number().nullable(),
                outlineLevelCol: z.number().nullable(),
                outlineLevelRow: z.number().nullable(),
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
                    scale: z.number().nullable()
                }).nullable(),
                headerFooter: z.object({
                    oddHeader: z.string().nullable(),
                    oddFooter: z.string().nullable(),
                    evenHeader: z.string().nullable(),
                    evenFooter: z.string().nullable(),
                    firstHeader: z.string().nullable(),
                    firstFooter: z.string().nullable()
                }).nullable(),
                autoFilter: z.string().nullable(),
                state: z.enum(['visible', 'hidden', 'veryHidden']).nullable()
            }),
            totalSheets: z.number()
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            updatedProperties: z.object({
                tabColor: z.string().nullable(),
                defaultRowHeight: z.number().nullable(),
                defaultColWidth: z.number().nullable(),
                outlineLevelCol: z.number().nullable(),
                outlineLevelRow: z.number().nullable(),
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
                    scale: z.number().nullable()
                }).nullable(),
                headerFooter: z.object({
                    oddHeader: z.string().nullable(),
                    oddFooter: z.string().nullable(),
                    evenHeader: z.string().nullable(),
                    evenFooter: z.string().nullable(),
                    firstHeader: z.string().nullable(),
                    firstFooter: z.string().nullable()
                }).nullable(),
                autoFilter: z.string().nullable(),
                state: z.enum(['visible', 'hidden', 'veryHidden']).nullable()
            }),
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
        const worksheet = getWorksheet(cmd.args, workbook, false);

        if (cmd.args.properties) {
            const props = cmd.args.properties;
            // Note: Some of these properties may not be available in the current ExcelJS version
            if (props.tabColor) {
                // @ts-ignore - tabColor may not be in TypeScript types but exists in runtime
                (worksheet as any).tabColor = props.tabColor;
            }
            if (props.defaultRowHeight != null) {
                // @ts-ignore - defaultRowHeight may not be in TypeScript types
                (worksheet as any).defaultRowHeight = props.defaultRowHeight;
            }
            if (props.defaultColWidth != null) {
                // @ts-ignore - defaultColWidth may not be in TypeScript types
                (worksheet as any).defaultColWidth = props.defaultColWidth;
            }
            if (props.outlineLevelCol != null) {
                // @ts-ignore - outlineLevelCol may not be in TypeScript types
                (worksheet as any).outlineLevelCol = props.outlineLevelCol;
            }
            if (props.outlineLevelRow != null) {
                // @ts-ignore - outlineLevelRow may not be in TypeScript types
                (worksheet as any).outlineLevelRow = props.outlineLevelRow;
            }
            if (props.pageSetup) {
                if (props.pageSetup.orientation) worksheet.pageSetup.orientation = props.pageSetup.orientation;
                if (props.pageSetup.margins) {
                // @ts-ignore - margins may require null conversion
                worksheet.pageSetup.margins = {
                    left: props.pageSetup.margins.left || 0,
                    right: props.pageSetup.margins.right || 0,
                    top: props.pageSetup.margins.top || 0,
                    bottom: props.pageSetup.margins.bottom || 0,
                    header: props.pageSetup.margins.header || 0,
                    footer: props.pageSetup.margins.footer || 0
                };
            }
                if (props.pageSetup.paperSize != null) worksheet.pageSetup.paperSize = props.pageSetup.paperSize;
                if (props.pageSetup.scale != null) worksheet.pageSetup.scale = props.pageSetup.scale;
            }
            if (props.headerFooter) {
                if (props.headerFooter.oddHeader !== undefined) {
                // @ts-ignore - Convert null to undefined
                worksheet.headerFooter.oddHeader = props.headerFooter.oddHeader || undefined;
            }
            if (props.headerFooter.oddFooter !== undefined) {
                // @ts-ignore - Convert null to undefined
                worksheet.headerFooter.oddFooter = props.headerFooter.oddFooter || undefined;
            }
            if (props.headerFooter.evenHeader !== undefined) {
                // @ts-ignore - Convert null to undefined
                worksheet.headerFooter.evenHeader = props.headerFooter.evenHeader || undefined;
            }
            if (props.headerFooter.evenFooter !== undefined) {
                // @ts-ignore - Convert null to undefined
                worksheet.headerFooter.evenFooter = props.headerFooter.evenFooter || undefined;
            }
            if (props.headerFooter.firstHeader !== undefined) {
                // @ts-ignore - Convert null to undefined
                worksheet.headerFooter.firstHeader = props.headerFooter.firstHeader || undefined;
            }
            if (props.headerFooter.firstFooter !== undefined) {
                // @ts-ignore - Convert null to undefined
                worksheet.headerFooter.firstFooter = props.headerFooter.firstFooter || undefined;
            }
            }
            if (props.autoFilter !== undefined) worksheet.autoFilter = props.autoFilter;
            if (props.state !== undefined) {
                // @ts-ignore - visibility properties may not be in TypeScript types
                if (props.state === 'hidden') (worksheet as any).hidden = true;
                else if (props.state === 'veryHidden') (worksheet as any).visibility = 'veryHidden';
                else (worksheet as any).visible = true;
            }
        }

        return {
            file: workbook,
            output: {
                message: `Worksheet properties updated`,
                worksheetName: worksheet.name,
                worksheetId: worksheet.id,
                updatedProperties: cmd.args.properties || {
                tabColor: null,
                defaultRowHeight: null,
                defaultColWidth: null,
                outlineLevelCol: null,
                outlineLevelRow: null,
                pageSetup: null,
                headerFooter: null,
                autoFilter: null,
                state: null
            },
                totalSheets: workbook.worksheets.length
            }
        };
    },
);