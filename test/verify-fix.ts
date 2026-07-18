import fc from 'fast-check';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from './helpers/test-server.js';
import { createTestContext } from './helpers/test-context.js';
import { run, getContext } from '../src/util/requestContext.js';
import { WorkbookTools } from '../src/tools/handleWorkbook.js';
import { CellWriteHandler } from '../src/tools/handleCells/write.js';
import { CellReadHandler } from '../src/tools/handleCells/read.js';
import { SheetHandler } from '../src/tools/handleSheet.js';

async function main() {
    const mockServer = new MockMcpServer();
    const testContext = await createTestContext('verify-test');
    const mockCtx = { authInfo: { extra: { userId: 'verify-test' } } };

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

    const ctx = createMockRequestContext('verify-test');
    await mockServer.getTool('create_new_workbook').cb({ filename: 'verify.xlsx' }, ctx);
    await mockServer.getTool('create_sheet').cb({ name: 'Sheet1' }, ctx);

    console.log('Testing string round-trips with fc.asyncProperty...');
    try {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
                async (value) => {
                    await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
                    const result = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
                    assert.equal(result.structuredContent.value, value);
                }
            ),
            { numRuns: 100 }
        );
        console.log('PASS: 100 string round-trips succeeded');
    } catch (e: any) {
        console.log('FAIL:', e.message);
    }

    console.log('\nTesting with specific problematic values...');
    const problemValues = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '!'];
    for (const value of problemValues) {
        await mockServer.getTool('set_cell').cb({ ref: 'B1', value }, ctx);
        const result = await mockServer.getTool('get_cell').cb({ ref: 'B1' }, ctx);
        if (result.structuredContent.value === value) {
            console.log(`  PASS: "${value}"`);
        } else {
            console.log(`  FAIL: "${value}" -> "${result.structuredContent.value}"`);
        }
    }

    await testContext.cleanup();
    console.log('\nDone.');
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
