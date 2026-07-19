import { ToolHandler } from './interface.js';
import {addWorksheet, createWorkbook, sheetNames } from '@office-kit/xlsx/workbook';
import { fromResponse, loadWorkbook } from '@office-kit/xlsx/io';
import { ResourceTemplate } from '@modelcontextprotocol/server';
import z from 'zod';
import { Context } from '../filesystem/context.js';
import wretch from 'wretch';
import { retry, dedupe, throttlingCache } from 'wretch/middlewares';

export const IMPORT_OPTIONS = {
    maxAttempts: 3,
    delayTimer: 500,
    throttle: 5 * 60 * 1000,
}

const workbookClient = wretch()
    .middlewares([
        retry({
            maxAttempts: IMPORT_OPTIONS.maxAttempts,
            delayTimer: IMPORT_OPTIONS.delayTimer,
            delayRamp: (delay, attempts) => delay * attempts,
            retryOnNetworkError: true,
            until: (response) => !!response && (response.ok || (response.status >= 400 && response.status < 500)),
        }),
        dedupe({
            key: (url, opts) => opts.method + '@' + url,
            resolver: (response) => response.clone(),
        }),
        throttlingCache({
            throttle: IMPORT_OPTIONS.throttle,
            key: (url, opts) => opts.method + '@' + url,
            condition: (response) => response.ok,
        }),
    ]);


export class WorkbookTools extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('create_new_workbook', { description: 'make new excel workbook and open it', inputSchema: z.object({
            filename: z.string().min(1),
            createDefaultWorksheet: z.union([
                z.literal(false),
                z.literal(true),
                z.string(),
            ]).default('Sheet1').meta({description: "Specify the sheet default sheet's name or pass false to create the workbook without a default sheet"})
        }), outputSchema: z.object({
            filename: z.string(),
            status: z.string(),
            sheets: z.array(z.string()),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const wb = createWorkbook();

            const shouldMakeWorkSheet = arg.createDefaultWorksheet && arg.createDefaultWorksheet !== 'false';
            const sheetName = arg.createDefaultWorksheet === true ? 'Sheet1' : arg.createDefaultWorksheet;
            if(shouldMakeWorkSheet) {
                addWorksheet(wb, sheetName);
            }

            await context.setWorkbook(arg.filename, wb);
            await context.setCurrentFile(arg.filename);

            if(shouldMakeWorkSheet) {
                await context.setCurrentSheet(`${sheetName}`);
            }

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `new workbook '${arg.filename}' created and set active${shouldMakeWorkSheet ? ` with default sheet '${sheetName}'` : ''}`},
                          { type: 'resource', resource: { uri: `workbook://${arg.filename}`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: JSON.stringify({ filename: arg.filename, status: 'created', sheets: sheetNames(wb) }) }}],
                structuredContent: {
                    filename: arg.filename,
                    status: 'created',
                    sheets: sheetNames(wb)
                }
            })
        });

        this.registerTool('import_workbook_from_url', { description: 'open an existing workbook from a url', inputSchema: z.object({
            url: z.string(),
            filename: z.string()
        }), outputSchema: z.object({
            filename: z.string(),
            status: z.string(),
            url: z.string(),
            sheets: z.array(z.string()),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
            readOnlyHint: false
        }}, async (arg) => {

            const result = await workbookClient
                .url(arg.url)
                .get()
                .notFound(() => { throw new Error(`could not find the workbook at '${arg.url}'. Please verify the URL is correct and the file exists at this location`) })
                .unauthorized(() => { throw new Error(`authentication required to access '${arg.url}'. This file may require login credentials or an access token`) })
                .forbidden(() => { throw new Error(`access denied to '${arg.url}'. You may not have permission to access this file`) })
                .timeout(() => { throw new Error(`request timed out while fetching '${arg.url}'. The server may be slow or unreachable`) })
                .fetchError((err) => { throw new Error(`network error while fetching '${arg.url}': ${err.message}. Please check your internet connection and verify the URL is reachable`) })
                .error(400, () => { throw new Error(`the server rejected the request for '${arg.url}' (bad request)`) })
                .error(500, () => { throw new Error(`the server hosting '${arg.url}' encountered an internal error`) })
                .res();
            const wb = await loadWorkbook(await fromResponse(result));

            await context.setWorkbook(arg.filename, wb);
            await context.setCurrentFile(arg.filename);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `import workbook '${arg.filename}' successfully and set active` },
                          { type: 'resource', resource: { uri: `workbook://${arg.filename}`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: JSON.stringify({ filename: arg.filename, status: 'imported', url: arg.url, sheets: sheetNames(wb) }) }}],
                structuredContent: {
                    filename: arg.filename,
                    status: 'imported',
                    url: arg.url,
                    sheets: sheetNames(wb)
                }
            })
        })

        this.registerTool('close_workbook', { description: 'close an existing workbook', inputSchema: z.object({
            filename: z.string().optional()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            status: z.string().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {

            const filename = arg.filename ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            try {
                if(!await context.get(arg.filename ?? filename)) {
                    throw new Error(`Missing ${filename}`)
                }
            } catch {
              return context.contextualiseResponse({
                    content: [{ type: 'text', text: `workbook '${filename}' doesn't exist` }],
                    isError: true,
                    structuredContent: {
                        filename,
                        status: 'error'
                    }
                });
            }

            await context.delete(filename);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `closed workbook '${filename} successfully'` },
                          { type: 'resource', resource: { uri: `workbook://${filename}`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: JSON.stringify({ filename, status: 'closed' }) }}],
                structuredContent: {
                    filename,
                    status: 'closed'
                }
            })
        })

        this.registerTool('list_open_workbook', { description: 'lists all open workbook', annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true
        }, outputSchema: z.object({
            files: z.array(z.string()),
            context: context.contextualiseResponseTypes()
        })}, async () => {

            const files = await context.list();

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `files currently open are ${files.join(', ')}` }],
                structuredContent: {
                    files: files
                }
            })
        })

        this.expressApp.get(`/download/:filename/:key`, async (req, res) => {
            const { filename, key } = req.params;
            try {
                const { data } = await Context.importFile(filename, key);
                res.setHeader('Content-Disposition', `attachment; filename="${filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`}"`);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.send(Buffer.from(data));
            } catch {
                res.status(404).send('Export not found or expired');
            }
        })

        this.registerTool('export_workbook_to_url', { description: 'export a workbook to a url, so it can be downloaded from there', inputSchema: z.object({
            filename: z.string().optional(),
            autoclose: z.boolean().optional()
        }), outputSchema: z.looseObject({
            filename: z.string().optional(),
            downloadUrl: z.string().optional(),
            ttl: z.string().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {

            const filename = arg.filename ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            let file: Uint8Array;
            try {
                file = await context.get(filename);
            } catch {
                return context.contextualiseResponse({ content: [{ type: 'text', text: `workbook '${filename}' doesn't exist` }], isError: true });
            }
            const { key, ttl } = await Context.exportFile(filename, file);

            if(arg.autoclose) {
                await context.delete(filename);
            }

            const downloadUrl = `${this.serverOptions.serverHost}/download/${filename}/${key}`;
            const response = await context.contextualiseResponse({
                content: [{ type: 'text', text: `file available for download at '${downloadUrl}' until ${ttl}` }],
                structuredContent: {
                    downloadUrl,
                    ttl,
                    filename
                }
            });
            return response;
        })

        this.server.registerResource(
            'workbook',
            new ResourceTemplate('workbook://{name}', {
                list: async () => {
                    const files = await context.list();
                    return {
                        resources: files.map(name => ({
                            uri: `workbook://${name}`,
                            name,
                            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        }))
                    };
                }
            }),
            { title: 'Open Workbooks', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
            async (uri, variables) => {
                const name = variables.name as string;
                try {
                    const data = await context.get(name);
                    return {
                        contents: [{
                            uri: uri.href,
                            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            blob: Buffer.from(data).toString('base64')
                        }]
                    };
                } catch {
                    // Resource not found — return empty contents (MCP clients treat
                    // an empty `contents` array as "no such resource").
                    return { contents: [] };
                }
            }
        );

        
    }
}