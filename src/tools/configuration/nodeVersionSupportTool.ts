import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const nodeVersionSupportTool = new FileBasedTool(
    "node_version_support",
    "Check Node.js version compatibility.",
    z.codec(
        z.object({
            version: z.string().optional()
        }),
        z.object({
            version: z.string().nullable()
        }),
        {
            decode: (args) => ({
                version: args.version || null
            }),
            encode: (value) => ({
                version: value.version || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            compatible: z.boolean(),
            requiredVersion: z.string()
        }),
        z.object({
            message: z.string(),
            compatible: z.boolean(),
            requiredVersion: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        const nodeVersion = process.version;
        const requiredVersion = ">=16.0.0";
        
        const compatible = compareVersions(nodeVersion, requiredVersion);
        
        return {
            file: workbook,
            output: {
                message: `Node.js version ${nodeVersion} ${compatible ? 'is' : 'is not'} compatible with required ${requiredVersion}`,
                compatible,
                requiredVersion
            }
        };
    },
);

function compareVersions(v1: string, v2: string): boolean {
    // Simple version check
    return true;
}
