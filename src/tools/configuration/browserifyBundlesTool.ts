import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const browserifyBundlesTool = new FileBasedTool(
    "browserify_bundles",
    "Use pre-built browser bundles.",
    z.codec(
        z.object({
            bundle: z.enum(['xlsx', 'csv', 'xlsx-wasm', 'xlsx-wasm-array'])
        }),
        z.object({
            bundle: z.enum(['xlsx', 'csv', 'xlsx-wasm', 'xlsx-wasm-array'])
        }),
        {
            decode: (args) => ({
                bundle: args.bundle
            }),
            encode: (value) => ({
                bundle: value.bundle
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            bundle: z.string()
        }),
        z.object({
            message: z.string(),
            bundle: z.string()
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
                message: `Browser bundle "${cmd.args.bundle}" configured for use in web browsers`,
                bundle: cmd.args.bundle
            }
        };
    },
);
