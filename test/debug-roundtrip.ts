import { createTestContext } from './helpers/test-context.js';
import { MockMcpServer, createMockRequestContext } from './helpers/test-server.js';
import { WorkbookTools } from '../src/tools/handleWorkbook.js';
import { CellWriteHandler } from '../src/tools/handleCells/write.js';
import { CellReadHandler } from '../src/tools/handleCells/read.js';
import { SheetHandler } from '../src/tools/handleSheet.js';
import { run, getContext } from '../src/util/requestContext.js';

async function main() {
    const mockServer = new MockMcpServer();
    const testContext = await createTestContext('debug-test2');
    const mockCtx = { authInfo: { extra: { userId: 'debug-test2' } } };

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

        const cellWrite = new CellWriteHandler();
        cellWrite.server = mockServer as any;
        cellWrite.context = mockCtx as any;
        await cellWrite.register([]);

        const cellRead = new CellReadHandler();
        cellRead.server = mockServer as any;
        cellRead.context = mockCtx as any;
        await cellRead.register([]);

        const sheetHandler = new SheetHandler();
        sheetHandler.server = mockServer as any;
        sheetHandler.context = mockCtx as any;
        await sheetHandler.register([]);
    });

    const ctx = createMockRequestContext('debug-test2');
    await mockServer.getTool('create_new_workbook').cb({ filename: 'debug.xlsx' }, ctx);
    await mockServer.getTool('create_sheet').cb({ name: 'Sheet1' }, ctx);

    // Simulate property test iterations
    const values = ['hello', '!Ye', 'constructor', '!'];
    for (const value of values) {
        console.log(`\n--- Iteration with value: ${JSON.stringify(value)} ---`);
        const setRes = await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
        console.log('Set result:', JSON.stringify(setRes.structuredContent));
        
        const getRes = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
        console.log('Get result:', JSON.stringify(getRes.structuredContent));
        
        if (getRes.structuredContent.value !== value) {
            console.log('MISMATCH! Expected:', JSON.stringify(value), 'Got:', JSON.stringify(getRes.structuredContent.value));
        } else {
            console.log('OK');
        }
    }

    await testContext.cleanup();
    console.log('\nDONE');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
