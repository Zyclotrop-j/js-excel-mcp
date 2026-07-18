import type { CallToolResult } from '@modelcontextprotocol/server';
import { VirtualFileSystem } from './system.js'
import { WriteCoordinator } from './writeCoordinator.js'
import type { Workbook } from '@office-kit/xlsx/workbook';
import { fromArrayBuffer, loadWorkbook, workbookToBytes } from '@office-kit/xlsx/io';
import z from 'zod';
import { getContext } from '../util/requestContext.js';

export class Context {
    virtualFileSystem: VirtualFileSystem;
    userId: string;
    static sharedFs: VirtualFileSystem;
    constructor(vfs: VirtualFileSystem, userid: string) {
        this.virtualFileSystem = vfs;
        this.userId = userid;
    }
    private static sharedFsInitialized = false;
    static async initSharedFs(): Promise<VirtualFileSystem> {
        if (!Context.sharedFsInitialized) {
            Context.sharedFs = await VirtualFileSystem.acquire('_shared', true);
            WriteCoordinator.releaseLock('_shared');
            Context.sharedFsInitialized = true;
        }
        return Context.sharedFs;
    }
    static async getContext(userid: string) {
        const reqCtx = getContext();
        if(!reqCtx.context) {
            const vfs = await VirtualFileSystem.acquire(userid, false);
            reqCtx.virtualFileSystem = vfs;
            reqCtx.release = async () => { await vfs.release(); };
            reqCtx.context = new Context(vfs, userid);
        }
        return reqCtx.context;
    }
    get(fileName: string) {
        return this.virtualFileSystem.load(fileName)
    }
    set(fileName: string, content: Uint8Array) {
        return this.virtualFileSystem.save(fileName, content)
    }
    async getWorkbook(filename: string): Promise<Workbook> {
        const bytes = await this.virtualFileSystem.load(filename);
        return loadWorkbook(fromArrayBuffer(bytes));
    }
    async setWorkbook(filename: string, wb: Workbook): Promise<void> {
        this.virtualFileSystem.save(filename, await workbookToBytes(wb));
    }
    list(): Promise<string[]> {
        return this.virtualFileSystem.list()
    }
    async delete(fileName: string) {
        const currentFile = await this.getCurrentFile();
        this.virtualFileSystem.withTransaction(() => {
            this.virtualFileSystem.delete(fileName);
            if(currentFile === fileName) {
                this.virtualFileSystem.erase('currentFile');
            }
            this.virtualFileSystem.erasePrefix(`${fileName}-`);
            this.virtualFileSystem.erasePrefix(`cache:bands:${fileName}:`);
        });
    } 

    
    async getCurrentFile(): Promise<string | null> {
        return this.virtualFileSystem.recall('currentFile');
    }
    async setCurrentFile(value: string): Promise<void> {
        return this.virtualFileSystem.remember('currentFile', value);
    }

    async getCurrentSheet(): Promise<string | null> {
        return this.virtualFileSystem.recall(`${await this.getCurrentFile()}-currentSheet`);
    }
    async setCurrentSheet(value: string): Promise<void> {
        return this.virtualFileSystem.remember(`${await this.getCurrentFile()}-currentSheet`, value);
    }

    async getCurrentCell(): Promise<string | null> {
        return this.virtualFileSystem.recall(`${await this.getCurrentFile()}-${await this.getCurrentSheet()}-currentCell`);
    }
    async setCurrentCell(value: string): Promise<void> {
        return this.virtualFileSystem.remember(`${await this.getCurrentFile()}-${await this.getCurrentSheet()}-currentCell`, value);
    }

    async getCurrentState(): Promise<[{type: 'text', text: string}, Record<string, string | null>]> {
        const now = new Date().toISOString();
        const currentFile = await this.getCurrentFile();
        const currentSheet = await this.getCurrentSheet();
        const currentCell = await this.getCurrentCell();
        return [{ type: 'text', text: `context:
  file: ${currentFile ?? 'no file selected'}
  sheet: ${currentSheet ?? 'no sheet selected'}
  cell: ${currentCell ?? 'no cell selected'}
  asOf: ${now}` }, {
            currentFile,
            currentSheet,
            currentCell,
            now
            }]
    }

    async contextualiseResponse(existing: CallToolResult): Promise<CallToolResult> {
        const [c, t] = await this.getCurrentState()
        return ({
                ...existing,
                structuredContent: {
                    ...(existing.structuredContent ?? {}),
                    context:t
                },
                content: [c, ...existing.content]
            })
    }
    contextualiseResponseTypes() {
        return z.object({
            currentFile: z.string().nullable(),
            currentSheet: z.string().nullable(),
            currentCell: z.string().nullable(),
            now: z.string(),
        })
    }

    static async importFile(name: string, key: string) {
        await Context.initSharedFs();
        try {
            return await Context.sharedFs.importFile(name, key);
        } finally {
            await Context.sharedFs.flush();
        }
    }

    static async exportFile(name: string, data: Uint8Array) {
        await Context.initSharedFs();
        try {
            return await Context.sharedFs.exportFile(name, data);
        } finally {
            await Context.sharedFs.flush();
        }
    }

}