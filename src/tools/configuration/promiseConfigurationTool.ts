import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const promiseConfigurationTool = new FileBasedTool(
    "promise_configuration",
    "Configure promise library for ExcelJS.",
    z.codec(
        z.object({
            promise: z.string().optional(),
            action: z.enum(['set', 'get'])
        }),
        z.object({
            promise: z.string().nullable(),
            action: z.enum(['set', 'get'])
        }),
        {
            decode: (args) => ({
                promise: args.promise || null,
                action: args.action
            }),
            encode: (value) => ({
                promise: value.promise || undefined,
                action: value.action
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            currentPromise: z.string().nullable(),
            success: z.boolean()
        }),
        z.object({
            message: z.string(),
            currentPromise: z.string().nullable(),
            success: z.boolean()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        
        if (cmd.args.action === 'set' && cmd.args.promise) {
            try {
                // Attempt to require the promise library
                require(cmd.args.promise);
                ExcelJS.config.setValue('promise', require(cmd.args.promise));
                return {
                    file: workbook,
                    output: {
                        message: `Successfully configured promise library to ${cmd.args.promise}`,
                        currentPromise: cmd.args.promise,
                        success: true
                    }
                };
            } catch (error) {
                return {
                    file: workbook,
                    output: {
                        message: `Failed to configure promise library: ${error.message}`,
                        currentPromise: null,
                        success: false
                    }
                };
            }
        } else if (cmd.args.action === 'get') {
            return {
                file: workbook,
                output: {
                    message: `Current promise library: default (native promises)`,
                    currentPromise: null,
                    success: true
                }
            };
        }
        
        throw new Error('Invalid action. Use "set" or "get"');
    },
);

// Need to import ExcelJS
import ExcelJS from "exceljs";
