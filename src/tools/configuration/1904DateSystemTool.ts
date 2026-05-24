import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const date1904SystemTool = new FileBasedTool(
    "1904_date_system",
    "Support for Mac Excel 1904 date system.",
    z.codec(
        z.object({
            enabled: z.boolean()
        }),
        z.object({
            enabled: z.boolean()
        }),
        {
            decode: (args) => ({
                enabled: args.enabled
            }),
            encode: (value) => ({
                enabled: value.enabled
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            enabled: z.boolean()
        }),
        z.object({
            message: z.string(),
            enabled: z.boolean()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        
        if (cmd.args.enabled) {
            workbook.creator = 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1; .NET CLR 2.0.50727; InfoPath.2)';
        }
        
        return {
            file: workbook,
            output: {
                message: `1904 date system ${cmd.args.enabled ? 'enabled' : 'disabled'}`,
                enabled: cmd.args.enabled
            }
        };
    },
);
