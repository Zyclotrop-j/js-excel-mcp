import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const knownIssuesTool = new FileBasedTool(
    "known_issues",
    "Documented limitations and workarounds.",
    z.codec(
        z.object({
            category: z.string().optional()
        }),
        z.object({
            category: z.string().nullable()
        }),
        {
            decode: (args) => ({
                category: args.category || null
            }),
            encode: (value) => ({
                category: value.category || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            issues: z.array(z.object({
                issue: z.string(),
                workaround: z.string()
            }))
        }),
        z.object({
            message: z.string(),
            issues: z.array(z.object({
                issue: z.string(),
                workaround: z.string()
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
        
        const issues = [
            { issue: "Limited chart support", workaround: "Use XLSX modifications or separate chart library" },
            { issue: "VBA macros not supported", workaround: "Use VBA-specific tools for macro operations" },
            { issue: "Password-protected workbooks", workaround: "Use external password handling before ExcelJS processing" },
            { issue: "Some Excel features not yet implemented", workaround: "Check ExcelJS documentation for latest features" }
        ];
        
        return {
            file: workbook,
            output: {
                message: `Known issues for ${cmd.args.category || 'all categories'}`,
                issues: issues
            }
        };
    },
);
