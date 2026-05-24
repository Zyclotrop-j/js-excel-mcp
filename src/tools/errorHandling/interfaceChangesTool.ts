import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";

export const interfaceChangesTool = new FileBasedTool(
    "interface_changes",
    "Review breaking changes between ExcelJS versions.",
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
                breaking: z.boolean(),
                description: z.string(),
                migration: z.string().nullable()
            }))
        }),
        z.object({
            message: z.string(),
            changes: z.array(z.object({
                version: z.string(),
                breaking: z.boolean(),
                description: z.string(),
                migration: z.string().nullable()
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
            {
                version: "4.x",
                breaking: true,
                description: "Workbook parsing options changed",
                migration: "Use new option syntax for xlsx.load()"
            },
            {
                version: "4.x",
                breaking: true,
                description: "Cell.value type handling updated",
                migration: "Cell values now use native JavaScript types"
            },
            {
                version: "3.x",
                breaking: false,
                description: "Added streaming support",
                migration: null
            },
            {
                version: "3.x",
                breaking: true,
                description: "Promise configuration changed",
                migration: "Use Promise instead of bluebird"
            },
            {
                version: "2.x",
                breaking: true,
                description: "Major API restructuring",
                migration: "Migrate to new API pattern"
            }
        ];

        const filteredChanges = cmd.args.version
            ? changes.filter(c => c.version.includes(cmd.args.version))
            : changes;

        return {
            file: workbook,
            output: {
                message: `Found ${filteredChanges.length} interface changes`,
                changes: filteredChanges
            }
        };
    },
);