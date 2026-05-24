import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const headersFootersTool = new FileBasedTool(
    "headers_footers",
    "Add text headers and footers with formatting options for worksheets.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            headerFooter: z.object({
                differentFirst: z.boolean().optional(),
                differentOddEven: z.boolean().optional(),
                oddHeader: z.string().optional(),
                oddFooter: z.string().optional(),
                evenHeader: z.string().optional(),
                evenFooter: z.string().optional(),
                firstHeader: z.string().optional(),
                firstFooter: z.string().optional()
            })
        }),
        z.object({
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable(),
            headerFooter: z.object({
                differentFirst: z.boolean().nullable(),
                differentOddEven: z.boolean().nullable(),
                oddHeader: z.string().nullable(),
                oddFooter: z.string().nullable(),
                evenHeader: z.string().nullable(),
                evenFooter: z.string().nullable(),
                firstHeader: z.string().nullable(),
                firstFooter: z.string().nullable()
            })
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null,
                headerFooter: args.headerFooter || null
            }),
            encode: (value) => ({
                headerFooter: value.headerFooter,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId !== null ? value.worksheetId : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            updatedHeaderFooter: z.object({
                differentFirst: z.boolean().nullable(),
                differentOddEven: z.boolean().nullable(),
                oddHeader: z.string().nullable(),
                oddFooter: z.string().nullable(),
                evenHeader: z.string().nullable(),
                evenFooter: z.string().nullable(),
                firstHeader: z.string().nullable(),
                firstFooter: z.string().nullable()
            })
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            updatedHeaderFooter: z.object({
                differentFirst: z.boolean().nullable(),
                differentOddEven: z.boolean().nullable(),
                oddHeader: z.string().nullable(),
                oddFooter: z.string().nullable(),
                evenHeader: z.string().nullable(),
                evenFooter: z.string().nullable(),
                firstHeader: z.string().nullable(),
                firstFooter: z.string().nullable()
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

        // Apply header/footer properties
        if (cmd.args.headerFooter) {
            const hf = cmd.args.headerFooter;

            if (hf.differentFirst != undefined) {
                worksheet.headerFooter.differentFirst = hf.differentFirst;
            }
            if (hf.differentOddEven != undefined) {
                worksheet.headerFooter.differentOddEven = hf.differentOddEven;
            }
            if (hf.oddHeader != undefined) {
                worksheet.headerFooter.oddHeader = hf.oddHeader;
            }
            if (hf.oddFooter != undefined) {
                worksheet.headerFooter.oddFooter = hf.oddFooter;
            }
            if (hf.evenHeader != undefined) {
                worksheet.headerFooter.evenHeader = hf.evenHeader;
            }
            if (hf.evenFooter != undefined) {
                worksheet.headerFooter.evenFooter = hf.evenFooter;
            }
            if (hf.firstHeader != undefined) {
                worksheet.headerFooter.firstHeader = hf.firstHeader;
            }
            if (hf.firstFooter != undefined) {
                worksheet.headerFooter.firstFooter = hf.firstFooter;
            }
        }

        return {
            file: workbook,
            output: {
                message: `Header/footer updated for worksheet "${worksheet.name}"`,
                worksheetName: worksheet.name,
                worksheetId: worksheet.id,
                updatedHeaderFooter: cmd.args.headerFooter
            }
        };
    },
);