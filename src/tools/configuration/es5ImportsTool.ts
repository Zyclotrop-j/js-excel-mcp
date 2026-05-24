import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const es5ImportsTool = new FileBasedTool(
    "es5_imports",
    "Enable ES5 imports for Node.js 8.x+ compatibility.",
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
        
        return {
            file: workbook,
            output: {
                message: `ES5 imports ${cmd.args.enabled ? 'enabled' : 'disabled'} for Node.js 8.x+ compatibility`,
                enabled: cmd.args.enabled
            }
        };
    },
);
