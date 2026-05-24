import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const interfaceChangesTool = new FileBasedTool(
    "interface_changes",
    "Version compatibility notes and breaking changes.",
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
            changes: z.array(z.object({
                version: z.string(),
                change: z.string(),
                breaking: z.boolean()
            }))
        }),
        z.object({
            message: z.string(),
            changes: z.array(z.object({
                version: z.string(),
                change: z.string(),
                breaking: z.boolean()
            }))
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        
        const changes = [
            { version: "4.0", change: "Updated dependency versions", breaking: false },
            { version: "4.1", change: "Cell formula parsing changes", breaking: true },
            { version: "4.2", change: "Table style API updates", breaking: false },
            { version: "4.3", change: "CSV date parsing improvements", breaking: false }
        ];
        
        return {
            file: workbook,
            output: {
                message: `Interface changes for ${cmd.args.version || 'all versions'}`,
                changes: changes
            }
        };
    },
);
