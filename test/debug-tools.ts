import { run, getContext } from '../src/util/requestContext.js';
import { MockMcpServer, createMockRequestContext } from './helpers/test-server.js';
import { WorkbookTools } from '../src/tools/handleWorkbook.js';
import { CellWriteHandler } from '../src/tools/handleCells/write.js';
import { CellReadHandler } from '../src/tools/handleCells/read.js';
import { SheetHandler } from '../src/tools/handleSheet.js';
import { Context } from '../src/filesystem/context.js';

async function main() {
    const mockServer = new MockMcpServer();
    const testContext = await run(async () => await Context.getContext('debug3'));
    const mockCtx = { authInfo: { extra: { userId: 'debug3' } } };
    
    await run(async () => {
        const reqCtx = getContext();
        reqCtx.context = testContext;
        reqCtx.virtualFileSystem = testContext.virtualFileSystem;
        reqCtx.release = async () => {};
        
        const wbTools = new WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = mockCtx as any;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);
        
        const cw = new CellWriteHandler();
        cw.server = mockServer as any;
        cw.context = mockCtx as any;
        await cw.register([]);
        
        const cr = new CellReadHandler();
        cr.server = mockServer as any;
        cr.context = mockCtx as any;
        await cr.register([]);
        
        const sh = new SheetHandler();
        sh.server = mockServer as any;
        sh.context = mockCtx as any;
        await sh.register([]);
    });

    console.log('tools registered:', mockServer.registeredTools.size);
    
    const ctx = createMockRequestContext('debug3');
    const invoke = async (name: string, args: any) => run(async () => mockServer.getTool(name).cb(args, ctx));
    
    console.log('creating workbook...');
    const cr = await invoke('create_new_workbook', { filename: 'test.xlsx' });
    console.log('create result:', JSON.stringify(cr.structuredContent));
    
    console.log('creating sheet...');
    const sr = await invoke('create_sheet', { name: 'Sheet1' });
    console.log('sheet result:', JSON.stringify(sr.structuredContent));
    
    console.log('setting cell...');
    const setR = await invoke('set_cell', { ref: 'A1', value: 'hello' });
    console.log('set_cell result:', JSON.stringify(setR.structuredContent));
    
    console.log('getting cell...');
    const getR = await invoke('get_cell', { ref: 'A1' });
    console.log('get_cell result:', JSON.stringify(getR.structuredContent));
    
    await testContext.virtualFileSystem.release();
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
