import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";

export const knownIssuesTool = new FileBasedTool(
    "known_issues",
    "Get documentation of known issues and workarounds in ExcelJS.",
    z.codec(
        z.object({
            issue: z.string().optional()
        }),
        z.object({
            issue: z.string().nullable()
        }),
        {
            decode: (args) => ({
                issue: args.issue || null
            }),
            encode: (value) => ({
                issue: value.issue || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            issues: z.array(z.object({
                title: z.string(),
                description: z.string(),
                workaround: z.string().nullable()
            }))
        }),
        z.object({
            message: z.string(),
            issues: z.array(z.object({
                title: z.string(),
                description: z.string(),
                workaround: z.string().nullable()
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
        
        const knownIssues = [
            {
                title: "Shared Formulas",
                description: "Formulas in merged cells may not calculate correctly",
                workaround: "Use explicit formulas in each cell"
            },
            {
                title: "Page Breaks",
                description: "Page breaks may not render correctly in all versions",
                workaround: "Use Excel to set page breaks after loading"
            },
            {
                title: "Chart Data",
                description: "Chart data references may break when moving data",
                workaround: "Use absolute cell references"
            },
            {
                title: "Conditional Formatting",
                description: "Some complex conditional formatting rules may not persist",
                workaround: "Simplify rules or use manual formatting"
            },
            {
                title: "Hyperlinks",
                description: "Web hyperlinks may not work in all Excel versions",
                workaround: "Use relative paths or full URLs"
            }
        ];

        const filteredIssues = cmd.args.issue 
            ? knownIssues.filter(i => i.title.toLowerCase().includes(cmd.args.issue.toLowerCase()))
            : knownIssues;

        return {
            file: workbook,
            output: {
                message: `Found ${filteredIssues.length} known issues`,
                issues: filteredIssues
            }
        };
    },
);