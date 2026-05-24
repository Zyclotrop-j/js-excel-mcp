import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

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
            if (props.tabColor) worksheet.tabColor = props.tabColor;
            if (props.defaultRowHeight != null) worksheet.defaultRowHeight = props.defaultRowHeight;
            if (props.defaultColWidth != null) worksheet.defaultColWidth = props.defaultColWidth;
            if (props.outlineLevelCol != null) worksheet.outlineLevelCol = props.outlineLevelCol;
            if (props.outlineLevelRow != null) worksheet.outlineLevelRow = props.outlineLevelRow;
            if (props.pageSetup) {
                if (props.pageSetup.orientation) worksheet.pageSetup.orientation = props.pageSetup.orientation;
                if (props.pageSetup.margins) worksheet.pageSetup.margins = props.pageSetup.margins;
                if (props.pageSetup.paperSize != null) worksheet.pageSetup.paperSize = props.pageSetup.paperSize;
                if (props.pageSetup.scale != null) worksheet.pageSetup.scale = props.pageSetup.scale;
            }
            if (props.headerFooter) {
                if (props.headerFooter.oddHeader !== undefined) worksheet.headerFooter.oddHeader = props.headerFooter.oddHeader;
                if (props.headerFooter.oddFooter !== undefined) worksheet.headerFooter.oddFooter = props.headerFooter.oddFooter;
                if (props.headerFooter.evenHeader !== undefined) worksheet.headerFooter.evenHeader = props.headerFooter.evenHeader;
                if (props.headerFooter.evenFooter !== undefined) worksheet.headerFooter.evenFooter = props.headerFooter.evenFooter;
                if (props.headerFooter.firstHeader !== undefined) worksheet.headerFooter.firstHeader = props.headerFooter.firstHeader;
                if (props.headerFooter.firstFooter !== undefined) worksheet.headerFooter.firstFooter = props.headerFooter.firstFooter;
            }
            if (props.autoFilter !== undefined) worksheet.autoFilter = props.autoFilter;
            if (props.state !== undefined) {
                if (props.state === 'hidden') worksheet.hidden = true;
                else if (props.state === 'veryHidden') worksheet.visibility = 'veryHidden';
                else worksheet.visible = true;
            }
        }

        return {
            file: workbook,
            output: {
                message: `Worksheet properties updated`,
                worksheetName: worksheet.name,
                worksheetId: worksheet.id,
                updatedProperties: cmd.args.properties || {},
                totalSheets: workbook.worksheets.length
            }
        };
    },
);