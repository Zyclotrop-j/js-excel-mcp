import type { CallToolResult } from '@modelcontextprotocol/server';
import { VirtualFileSystem } from './system.js'
import type { Workbook } from '@office-kit/xlsx/workbook';
import { fromArrayBuffer, loadWorkbook, workbookToBytes } from '@office-kit/xlsx/io';
import z from 'zod';

export class Context {
    virtualFileSystem: VirtualFileSystem;
    userId: string;
    static sharedFs = new VirtualFileSystem('_shared', true);
    constructor(userid: string) {
        this.virtualFileSystem = new VirtualFileSystem(userid, false);
        this.userId = userid;
    }
    static contextCache = new Map<string, Context>();
    static getContext(userid: string) {
        if(!Context.contextCache.get(userid)) {
            Context.contextCache.set(userid, new Context(userid));
        }
        return Context.contextCache.get(userid)!;
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
            this.virtualFileSystem.eraseMatching(`currentSheet-${fileName}`);
            this.virtualFileSystem.eraseMatching(`currentCell-%-${fileName}`);
            this.virtualFileSystem.eraseMatching(`cache:bands:${fileName}:%`);
        });
    } 

    
    async getCurrentFile(): Promise<string | null> {
        return this.virtualFileSystem.recall('currentFile');
    }
    async setCurrentFile(value: string): Promise<void> {
        return this.virtualFileSystem.remember('currentFile', value);
    }

    async getCurrentSheet(): Promise<string | null> {
        return this.virtualFileSystem.recall(`currentSheet-${await this.getCurrentFile()}`);
    }
    async setCurrentSheet(value: string): Promise<void> {
        return this.virtualFileSystem.remember(`currentSheet-${await this.getCurrentFile()}`, value);
    }

    async getCurrentCell(): Promise<string | null> {
        return this.virtualFileSystem.recall(`currentCell-${await this.getCurrentSheet()}-${await this.getCurrentFile()}`);
    }
    async setCurrentCell(value: string): Promise<void> {
        return this.virtualFileSystem.remember(`currentCell-${await this.getCurrentSheet()}-${await this.getCurrentFile()}`, value);
    }

    async getCurrentState(): Promise<[{type: 'text', text: string}, Record<string, string | null>]> {
        const currentFile = await this.getCurrentFile();
        const currentSheet = await this.getCurrentSheet();
        const currentCell = await this.getCurrentCell();
        return [{ type: 'text', text: `context:
  file: ${currentFile ?? 'no file selected'}
  sheet: ${currentSheet ?? 'no sheet selected'}
  cell: ${currentCell ?? 'no cell selected'}` }, {
            currentFile,
            currentSheet,
            currentCell,
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
        })
    }

    static async importFile(name: string, key: string) {
        return Context.sharedFs.importFile(name, key);
    }

    static async exportFile(name: string, data: Uint8Array) {
        return Context.sharedFs.exportFile(name, data);
    }

}