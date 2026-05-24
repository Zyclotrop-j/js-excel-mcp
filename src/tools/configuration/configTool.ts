import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const configTool = new FileBasedTool(
    "config",
    "ExcelJS configuration settings.",
    z.codec(
        z.object({
            action: z.enum(['get', 'set', 'remove']),
            key: z.string().optional(),
            value: z.unknown().optional()
        }),
        z.object({
            action: z.enum(['get', 'set', 'remove']),
            key: z.string().nullable(),
            value: z.unknown().nullable()
        }),
        {
            decode: (args) => ({
                action: args.action,
                key: args.key || null,
                value: args.value != undefined ? args.value : null
            }),
            encode: (value) => ({
                action: value.action,
                key: value.key || undefined,
                value: value.value !== null ? value.value : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            config: z.record(z.unknown())
        }),
        z.object({
            message: z.string(),
            config: z.record(z.unknown())
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        
        if (cmd.args.action === 'get' && cmd.args.key) {
            const val = ExcelJS.config.getValue(cmd.args.key);
            return {
                file: workbook,
                output: {
                    message: `Config key "${cmd.args.key}" = ${JSON.stringify(val)}`,
                    config: { [cmd.args.key]: val }
                }
            };
        } else if (cmd.args.action === 'get') {
            return {
                file: workbook,
                output: {
                    message: `Current configuration: default settings`,
                    config: {}
                }
            };
        } else if (cmd.args.action === 'set' && cmd.args.key != undefined) {
            ExcelJS.config.setValue(cmd.args.key, cmd.args.value);
            return {
                file: workbook,
                output: {
                    message: `Config "${cmd.args.key}" set to ${JSON.stringify(cmd.args.value)}`,
                    config: { [cmd.args.key]: cmd.args.value }
                }
            };
        } else if (cmd.args.action === 'remove' && cmd.args.key) {
            ExcelJS.config.removeValue(cmd.args.key);
            return {
                file: workbook,
                output: {
                    message: `Config "${cmd.args.key}" removed`,
                    config: {}
                }
            };
        }
        
        throw new Error('Invalid config operation');
    },
);

import ExcelJS from "exceljs";
