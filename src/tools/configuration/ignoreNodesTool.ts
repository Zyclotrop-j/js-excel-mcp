import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const ignoreNodesTool = new FileBasedTool(
    "ignore_nodes",
    "Optimize parsing performance by ignoring nodes.",
    z.codec(
        z.object({
            action: z.enum(['set', 'get', 'reset']),
            nodes: z.array(z.string()).optional()
        }),
        z.object({
            action: z.enum(['set', 'get', 'reset']),
            nodes: z.array(z.string()).nullable()
        }),
        {
            decode: (args) => ({
                action: args.action,
                nodes: args.nodes || null
            }),
            encode: (value) => ({
                action: value.action,
                nodes: value.nodes || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            ignoredNodes: z.array(z.string())
        }),
        z.object({
            message: z.string(),
            ignoredNodes: z.array(z.string())
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        
        if (cmd.args.action === 'set' && cmd.args.nodes) {
            ExcelJS.config.setValue('performance.ignoreNodes', cmd.args.nodes);
            return {
                file: workbook,
                output: {
                    message: `Ignoring nodes: ${cmd.args.nodes.join(', ')}`,
                    ignoredNodes: cmd.args.nodes
                }
            };
        } else if (cmd.args.action === 'get') {
            return {
                file: workbook,
                output: {
                    message: `Currently ignored nodes: none`,
                    ignoredNodes: []
                }
            };
        } else {
            ExcelJS.config.removeValue('performance.ignoreNodes');
            return {
                file: workbook,
                output: {
                    message: `Reset: ignoring nodes configuration removed`,
                    ignoredNodes: []
                }
            };
        }
    },
);

import ExcelJS from "exceljs";
