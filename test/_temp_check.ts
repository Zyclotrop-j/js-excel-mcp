import { run } from '../src/util/requestContext.js';
import { WorkbookTools } from '../src/tools/handleWorkbook.js';
import { CellWriteHandler } from '../src/tools/handleCells/write.js';
import { CellReadHandler } from '../src/tools/handleCells/read.js';
import { SheetHandler } from '../src/tools/handleSheet.js';
import { MockMcpServer, createMockRequestContext } from './helpers/test-server.js';
import { createTestContext } from './helpers/test-context.js';

async function main() {
    const mockServer = new MockMcpServer();
    const testContext = await createTestContext('cell-props');
    const mockCtx = { authInfo: { extra: { userId: 'cell-props' } } };

    console.log('1. testContext created');

    await run(async () => {
        const wbTools = new WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = mockCtx as any;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);
        console.log('2. wb registered');

        const cellWrite = new CellWriteHandler();
        cellWrite.server = mockServer as any;
        cellWrite.context = mockCtx as any;
        await cellWrite.register([]);
        console.log('3. cellWrite registered');

        const cellRead = new CellReadHandler();
        cellRead.server = mockServer as any;
        cellRead.context = mockCtx as any;
        await cellRead.register([]);
        console.log('4. cellRead registered');

        const sheetHandler = new SheetHandler();
        sheetHandler.server = mockServer as any;
        sheetHandler.context = mockCtx as any;
        await sheetHandler.register([]);
        console.log('5. sheetHandler registered');
    });
    console.log('6. run complete');

    const ctx = createMockRequestContext('cell-props');
    const result = await mockServer.getTool('create_new_workbook').cb({ filename: 'cell-test.xlsx' }, ctx);
    console.log('7. create result:', JSON.stringify(result.structuredContent));

    await testContext.cleanup();
    console.log('8. ALL DONE');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT after 15s'); process.exit(1); }, 15000);
