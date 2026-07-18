/**
 * E2E tests for data roundtrip integrity.
 * Tests: create → set cells → export → import → get cells.
 * Verifies data survives the full write-export-import-read cycle.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellReadHandler, CellWriteHandler, CellCursorHandler, CellDiscoveryHandler } from '../../src/tools/handleCell.js';
import { SheetHandler } from '../../src/tools/handleSheet.js';
import { Context } from '../../src/filesystem/context.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Data Roundtrip E2E');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let originalFetch: typeof globalThis.fetch;

test('setup', async () => {
    await run(async () => {
    mockServer = new MockMcpServer();
    testContext = createTestContext('data-roundtrip-e2e');

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

    originalFetch = globalThis.fetch;
    });
});

test('teardown', async () => {
    globalThis.fetch = originalFetch;
    await (await testContext).cleanup();
});

test('write cells → read back → data matches', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('data-roundtrip-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'roundtrip.xlsx' }, ctx);

    const testData = [
        { cell: 'A1', value: 'Hello' },
        { cell: 'B1', value: 42 },
        { cell: 'C1', value: true },
        { cell: 'D1', value: 3.14 },
        { cell: 'A2', value: 'World' },
        { cell: 'B2', value: 0 },
        { cell: 'C2', value: false },
        { cell: 'D2', value: -100 }
    ];

    await mockServer.getTool('set_cells').cb({ cells: testData }, ctx);

    for (const { cell, value } of testData) {
        const result = await mockServer.getTool('get_cell').cb({ cell }, ctx);
        assert.equal(result.structuredContent.value, value, `Cell ${cell} roundtrip failed`);
    }
    });
});

test('write cells on multiple sheets → read back → data persists across sheets', async () => {
    const ctx = createMockRequestContext('data-roundtrip-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'multi-sheet.xlsx' }, ctx);

    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'Sheet1-data' }, ctx);

    await mockServer.getTool('create_sheet').cb({ name: 'Sheet2' }, ctx);
    await mockServer.getTool('select_sheet').cb({ name: 'Sheet2' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'B2', value: 'Sheet2-data' }, ctx);

    await mockServer.getTool('select_sheet').cb({ name: 'Sheet1' }, ctx);
    const s1 = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(s1.structuredContent.value, 'Sheet1-data');

    await mockServer.getTool('select_sheet').cb({ name: 'Sheet2' }, ctx);
    const s2 = await mockServer.getTool('get_cell').cb({ cell: 'B2' }, ctx);
    assert.equal(s2.structuredContent.value, 'Sheet2-data');
});

test('export → import roundtrip with mock fetch', async () => {
    const ctx = createMockRequestContext('data-roundtrip-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'export-import.xlsx' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'roundtrip-value' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'B1', value: 999 }, ctx);

    const exportResult = await mockServer.getTool('export_workbook_to_url').cb({ filename: 'export-import.xlsx' }, ctx);
    assert.ok(exportResult.structuredContent.downloadUrl);

    await mockServer.getTool('close_workbook').cb({ filename: 'export-import.xlsx' }, ctx);

    const fileBytes = await (await testContext).get('export-import.xlsx');

    globalThis.fetch = async (input: any) => {
        const url = typeof input === 'string' ? input : input.url;
        return new Response(Buffer.from(fileBytes), {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        });
    };

    const importResult = await mockServer.getTool('import_workbook_from_url').cb({
        url: exportResult.structuredContent.downloadUrl,
        filename: 'imported.xlsx'
    }, ctx);
    assert.equal(importResult.structuredContent.status, 'imported');
    assert.ok(Array.isArray(importResult.structuredContent.sheets));

    const a1 = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(a1.structuredContent.value, 'roundtrip-value');

    const b1 = await mockServer.getTool('get_cell').cb({ cell: 'B1' }, ctx);
    assert.equal(b1.structuredContent.value, 999);
});

test('overwrite cell data → read back → sees latest value', async () => {
    const ctx = createMockRequestContext('data-roundtrip-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'overwrite.xlsx' }, ctx);

    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'version-1' }, ctx);
    let result = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(result.structuredContent.value, 'version-1');

    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'version-2' }, ctx);
    result = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(result.structuredContent.value, 'version-2');

    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'version-3' }, ctx);
    result = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(result.structuredContent.value, 'version-3');
});

test('large batch write → range read → data intact', async () => {
    const ctx = createMockRequestContext('data-roundtrip-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'batch.xlsx' }, ctx);

    const cells = [];
    for (let i = 1; i <= 20; i++) {
        cells.push({ cell: `A${i}`, value: `row-${i}` });
        cells.push({ cell: `B${i}`, value: i * 10 });
    }

    const setResult = await mockServer.getTool('set_cells').cb({ cells }, ctx);
    assert.equal(setResult.structuredContent.count, 40);

    const rangeResult = await mockServer.getTool('get_range').cb({ range: 'A1:B20' }, ctx);
    assert.ok(rangeResult.structuredContent);

    for (let i = 1; i <= 20; i++) {
        const a = await mockServer.getTool('get_cell').cb({ cell: `A${i}` }, ctx);
        assert.equal(a.structuredContent.value, `row-${i}`);
        const b = await mockServer.getTool('get_cell').cb({ cell: `B${i}` }, ctx);
        assert.equal(b.structuredContent.value, i * 10);
    }
});

export default async function () {
    await test.run();
}
