/**
 * E2E tests for full workbook lifecycle.
 * Tests: create → write data → export → verify download URL → close.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellReadHandler, CellWriteHandler, CellCursorHandler, CellDiscoveryHandler } from '../../src/tools/handleCell.js';
import { SheetHandler } from '../../src/tools/handleSheet.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Workbook Lifecycle E2E');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;

test('setup', async () => {
    await run(async () => {
    mockServer = new MockMcpServer();
    testContext = createTestContext('wb-lifecycle-e2e');

    const wbTools = new WorkbookTools();
    wbTools.server = mockServer as any;
    wbTools.context = testContext;
    wbTools.expressApp = { get: () => {}, post: () => {} } as any;
    wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
    await wbTools.register([]);

    const cellRead = new CellReadHandler();
    cellRead.server = mockServer as any;
    cellRead.context = testContext;
    await cellRead.register([]);

    const cellWrite = new CellWriteHandler();
    cellWrite.server = mockServer as any;
    cellWrite.context = testContext;
    await cellWrite.register([]);

    const cellCursor = new CellCursorHandler();
    cellCursor.server = mockServer as any;
    cellCursor.context = testContext;
    await cellCursor.register([]);

    const cellDiscovery = new CellDiscoveryHandler();
    cellDiscovery.server = mockServer as any;
    cellDiscovery.context = testContext;
    await cellDiscovery.register([]);

    const sheetHandler = new SheetHandler();
    sheetHandler.server = mockServer as any;
    sheetHandler.context = testContext;
    await sheetHandler.register([]);
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});

test('full lifecycle: create → write data → list → export → close', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('wb-lifecycle-e2e');

    const createResult = await mockServer.getTool('create_new_workbook').cb({ filename: 'lifecycle-e2e.xlsx' }, ctx);
    assert.equal(createResult.structuredContent.status, 'created');
    assert.equal(createResult.structuredContent.filename, 'lifecycle-e2e.xlsx');
    assert.ok(Array.isArray(createResult.structuredContent.sheets));
    assert.equal(createResult.structuredContent.sheets.length, 1);

    const setCellResult = await mockServer.getTool('set_cell').cb({ ref: 'A1', value: 'Hello E2E' }, ctx);
    assert.equal(setCellResult.structuredContent.ref, 'A1');
    assert.equal(setCellResult.structuredContent.value, 'Hello E2E');

    const getCellResult = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
    assert.equal(getCellResult.structuredContent.value, 'Hello E2E');

    const listResult = await mockServer.getTool('list_open_workbook').cb({}, ctx);
    assert.ok(listResult.structuredContent.files.includes('lifecycle-e2e.xlsx'));

    const currentFile = await (await testContext).getCurrentFile();
    assert.equal(currentFile, 'lifecycle-e2e.xlsx');

    const exportResult = await mockServer.getTool('export_workbook_to_url').cb({ filename: 'lifecycle-e2e.xlsx' }, ctx);
    assert.ok(exportResult.structuredContent.downloadUrl);
    assert.ok(exportResult.structuredContent.downloadUrl.includes('/download/lifecycle-e2e.xlsx/'));
    assert.ok(exportResult.structuredContent.ttl);
    assert.equal(exportResult.structuredContent.filename, 'lifecycle-e2e.xlsx');

    const closeResult = await mockServer.getTool('close_workbook').cb({ filename: 'lifecycle-e2e.xlsx' }, ctx);
    assert.equal(closeResult.structuredContent.status, 'closed');

    const listAfterClose = await mockServer.getTool('list_open_workbook').cb({}, ctx);
    assert.ok(!listAfterClose.structuredContent.files.includes('lifecycle-e2e.xlsx'));
    });
});

test('export with autoclose removes workbook', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('wb-lifecycle-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'autoclose-e2e.xlsx' }, ctx);

    const exportResult = await mockServer.getTool('export_workbook_to_url').cb({ filename: 'autoclose-e2e.xlsx', autoclose: true }, ctx);
    assert.ok(exportResult.structuredContent.downloadUrl);

    const listResult = await mockServer.getTool('list_open_workbook').cb({}, ctx);
    assert.ok(!listResult.structuredContent.files.includes('autoclose-e2e.xlsx'));
    });
});

test('create multiple workbooks and list them all', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('wb-lifecycle-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'multi-a.xlsx' }, ctx);
    await mockServer.getTool('create_new_workbook').cb({ filename: 'multi-b.xlsx' }, ctx);
    await mockServer.getTool('create_new_workbook').cb({ filename: 'multi-c.xlsx' }, ctx);

    const listResult = await mockServer.getTool('list_open_workbook').cb({}, ctx);
    assert.ok(listResult.structuredContent.files.includes('multi-a.xlsx'));
    assert.ok(listResult.structuredContent.files.includes('multi-b.xlsx'));
    assert.ok(listResult.structuredContent.files.includes('multi-c.xlsx'));
    });
});

test('close workbook that does not exist returns error', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('wb-lifecycle-e2e');

    const result = await mockServer.getTool('close_workbook').cb({ filename: 'ghost.xlsx' }, ctx);
    assert.ok(result.content);
    assert.ok(result.content.some((c: any) => c.text.includes("doesn't exist") || c.text.includes('error')));
    });
});

test('export without open workbook returns error', async () => {
    await run(async () => {
        // Use a separate context with no workbook to test the error path.
        const noWbContext = await createTestContext('wb-lifecycle-no-wb');
        const noWbServer = new MockMcpServer();

        const noWbTools = new WorkbookTools();
        noWbTools.server = noWbServer as any;
        noWbTools.context = noWbContext;
        noWbTools.expressApp = { get: () => {}, post: () => {} } as any;
        noWbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await noWbTools.register([]);

        const ctx = createMockRequestContext('wb-lifecycle-no-wb');
        const result = await noWbServer.getTool('export_workbook_to_url').cb({}, ctx);
        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes('no workbook is currently open')));

        await noWbContext.cleanup();
    });
});

export default async function () {
    await test.run();
}
