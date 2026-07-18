/**
 * E2E tests for full sheet lifecycle.
 * Tests: create workbook → add sheets → rename → copy → move → delete.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { SheetTools } from '../../src/tools/handleSheet.js';
import { SheetOpsTools } from '../../src/tools/handleSheetOps.js';
import { CellTools } from '../../src/tools/handleCell.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Sheet Lifecycle E2E');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;

test('setup', async () => {
    await run(async () => {
    mockServer = new MockMcpServer();
    testContext = createTestContext('sheet-lifecycle-e2e');

    const wbTools = new WorkbookTools();
    wbTools.server = mockServer as any;
    wbTools.context = testContext;
    wbTools.expressApp = { get: () => {}, post: () => {} } as any;
    wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
    await wbTools.register([]);

    const sheetTools = new SheetTools();
    sheetTools.server = mockServer as any;
    sheetTools.context = testContext;
    await sheetTools.register([]);

    const sheetOpsTools = new SheetOpsTools();
    sheetOpsTools.server = mockServer as any;
    sheetOpsTools.context = testContext;
    await sheetOpsTools.register([]);

    const cellTools = new CellTools();
    cellTools.server = mockServer as any;
    cellTools.context = testContext;
    await cellTools.register([]);
    });
});

test('teardown', async () => {
    await testContext.cleanup();
});

test('full sheet lifecycle: create → list → add → select → rename → copy → move → delete', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('sheet-lifecycle-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'sheet-lifecycle.xlsx' }, ctx);

    let listResult = await mockServer.getTool('list_sheets').cb({}, ctx);
    assert.ok(listResult.structuredContent.sheets.includes('Sheet1'));

    const createResult = await mockServer.getTool('create_sheet').cb({ name: 'Data' }, ctx);
    assert.equal(createResult.structuredContent.status, 'created');
    assert.equal(createResult.structuredContent.sheet, 'Data');

    const selectResult = await mockServer.getTool('select_sheet').cb({ name: 'Data' }, ctx);
    assert.equal(selectResult.structuredContent.sheet, 'Data');
    const currentSheet = await testContext.getCurrentSheet();
    assert.equal(currentSheet, 'Data');

    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'Sheet data' }, ctx);
    const getCellResult = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(getCellResult.structuredContent.value, 'Sheet data');

    const renameResult = await mockServer.getTool('rename_sheet').cb({ oldName: 'Data', newName: 'Records' }, ctx);
    assert.equal(renameResult.structuredContent.status, 'renamed');
    assert.equal(renameResult.structuredContent.oldName, 'Data');
    assert.equal(renameResult.structuredContent.newName, 'Records');

    listResult = await mockServer.getTool('list_sheets').cb({}, ctx);
    assert.ok(!listResult.structuredContent.sheets.includes('Data'));
    assert.ok(listResult.structuredContent.sheets.includes('Records'));

    const copyResult = await mockServer.getTool('copy_sheet').cb({ sourceName: 'Sheet1', targetName: 'Sheet1_Backup' }, ctx);
    assert.equal(copyResult.structuredContent.status, 'copied');

    listResult = await mockServer.getTool('list_sheets').cb({}, ctx);
    assert.ok(listResult.structuredContent.sheets.includes('Sheet1'));
    assert.ok(listResult.structuredContent.sheets.includes('Sheet1_Backup'));
    assert.ok(listResult.structuredContent.sheets.includes('Records'));

    await mockServer.getTool('create_sheet').cb({ name: 'SheetA' }, ctx);
    await mockServer.getTool('create_sheet').cb({ name: 'SheetB' }, ctx);

    const moveResult = await mockServer.getTool('move_sheet').cb({ name: 'Records', position: 0 }, ctx);
    assert.equal(moveResult.structuredContent.status, 'moved');
    assert.equal(moveResult.structuredContent.position, 0);

    listResult = await mockServer.getTool('list_sheets').cb({}, ctx);
    assert.equal(listResult.structuredContent.sheets[0], 'Records');

    const deleteResult = await mockServer.getTool('delete_sheet').cb({ name: 'Sheet1_Backup' }, ctx);
    assert.equal(deleteResult.structuredContent.status, 'deleted');

    listResult = await mockServer.getTool('list_sheets').cb({}, ctx);
    assert.ok(!listResult.structuredContent.sheets.includes('Sheet1_Backup'));
    });
});

test('select non-existent sheet returns error', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('sheet-lifecycle-e2e');

    const result = await mockServer.getTool('select_sheet').cb({ name: 'NoSuchSheet' }, ctx);
    assert.ok(result.content);
    assert.ok(result.content.some((c: any) => c.text.includes('not found') || c.text.includes('error')));
    });
});

test('cannot delete the last remaining sheet', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('sheet-lifecycle-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'last-sheet.xlsx' }, ctx);

    const listResult = await mockServer.getTool('list_sheets').cb({}, ctx);
    const sheets = listResult.structuredContent.sheets;

    for (const sheet of sheets.slice(1)) {
        await mockServer.getTool('delete_sheet').cb({ name: sheet }, ctx);
    }

    const result = await mockServer.getTool('delete_sheet').cb({ name: sheets[0] }, ctx);
    assert.ok(result.content);
    assert.ok(result.content.some((c: any) => c.text.includes('cannot delete') || c.text.includes('last sheet') || c.text.includes('error')));
    });
});

export default function registerTests(testInstance: ReturnType<typeof baretest>) {
}
