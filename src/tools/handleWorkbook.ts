import { ToolHandler } from './interface.js';
import {addWorksheet, createWorkbook, sheetNames } from '@office-kit/xlsx/workbook';
import { fromResponse, loadWorkbook } from '@office-kit/xlsx/io';
import { ResourceTemplate } from '@modelcontextprotocol/server';
import z from 'zod';
import { Context } from '../filesystem/context.js';


export class WorkbookTools extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        console.log(`User is ${this.context.authInfo?.extra?.userId}`);
        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('create_new_workbook', { description: 'make new excel workbook and open it', inputSchema: z.object({
            filename: z.string(),
            createDefaultWorksheet: z.union([
                z.literal(false),
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

            if(arg.createDefaultWorksheet) {
                addWorksheet(wb, arg.createDefaultWorksheet);
            }

            await context.setWorkbook(arg.filename, wb);
            await context.setCurrentFile(arg.filename);

            if(arg.createDefaultWorksheet) {
                await context.setCurrentSheet(arg.createDefaultWorksheet);
            }

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `new workbook '${arg.filename}' created and set active${arg.createDefaultWorksheet ? ` with default sheet '${arg.createDefaultWorksheet}'` : ''}`},
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
            
            const result = await fetch(arg.url);
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
            filename: z.string()
        }), outputSchema: z.object({
            filename: z.string(),
            status: z.string(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {

            await context.delete(arg.filename);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `closed workbook '${arg.filename} successfully'` },
                          { type: 'resource', resource: { uri: `workbook://${arg.filename}`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: JSON.stringify({ filename: arg.filename, status: 'closed' }) }}],
                structuredContent: {
                    filename: arg.filename,
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
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const file = await context.get(filename);
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
            console.log(response);
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
                const data = await context.get(name);
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        blob: Buffer.from(data).toString('base64')
                    }]
                };
            }
        );

        
    }
}