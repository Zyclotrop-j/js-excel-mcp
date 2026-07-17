/**
 * E2E tests for chained tool call scenarios.
 * Tests: create workbook → chain cell writes → chain style changes.
 * Verifies that rapid sequential tool calls maintain correct state.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellTools } from '../../src/tools/handleCell.js';
import { SheetTools } from '../../src/tools/handleSheet.js';
import { SheetOpsTools } from '../../src/tools/handleSheetOps.js';
import { StyleHandler } from '../../src/tools/handleStyle.js';

const test = baretest('Chain Scenarios E2E');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;

test('setup', async () => {
    mockServer = new MockMcpServer();
    testContext = createTestContext('chain-scenarios-e2e');

    const wbTools = new WorkbookTools();
    wbTools.server = mockServer as any;
    wbTools.context = testContext;
    wbTools.expressApp = { get: () => {}, post: () => {} } as any;
    wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
    await wbTools.register([]);

    const cellTools = new CellTools();
    cellTools.server = mockServer as any;
    cellTools.context = testContext;
    await cellTools.register([]);

    const sheetTools = new SheetTools();
    sheetTools.server = mockServer as any;
    sheetTools.context = testContext;
    await sheetTools.register([]);

    const sheetOpsTools = new SheetOpsTools();
    sheetOpsTools.server = mockServer as any;
    sheetOpsTools.context = testContext;
    await sheetOpsTools.register([]);

    const styleHandler = new StyleHandler();
    styleHandler.server = mockServer as any;
    styleHandler.context = testContext;
    await styleHandler.register([]);
});

test('teardown', async () => {
    await testContext.cleanup();
});

test('chain: create workbook → set cells in sequence → read all back', async () => {
    const ctx = createMockRequestContext('chain-scenarios-e2e');
    const set = mockServer.getTool('set_cell');
    const get = mockServer.getTool('get_cell');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'chain-cells.xlsx' }, ctx);

    const values = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
    for (let i = 0; i < values.length; i++) {
        await set.cb({ cell: `A${i + 1}`, value: values[i] }, ctx);
    }

    for (let i = 0; i < values.length; i++) {
        const result = await get.cb({ cell: `A${i + 1}` }, ctx);
        assert.equal(result.structuredContent.value, values[i], `Cell A${i + 1} chain failed`);
    }
});

test('chain: create sheet → switch → write → switch back → write → verify both', async () => {
    const ctx = createMockRequestContext('chain-scenarios-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'chain-sheets.xlsx' }, ctx);

    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'sheet1-value' }, ctx);

    await mockServer.getTool('create_sheet').cb({ name: 'Second' }, ctx);
    await mockServer.getTool('select_sheet').cb({ name: 'Second' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'B1', value: 'sheet2-value' }, ctx);

    await mockServer.getTool('create_sheet').cb({ name: 'Third' }, ctx);
    await mockServer.getTool('select_sheet').cb({ name: 'Third' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'C1', value: 'sheet3-value' }, ctx);

    await mockServer.getTool('select_sheet').cb({ name: 'Sheet1' }, ctx);
    let result = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(result.structuredContent.value, 'sheet1-value');

    await mockServer.getTool('select_sheet').cb({ name: 'Second' }, ctx);
    result = await mockServer.getTool('get_cell').cb({ cell: 'B1' }, ctx);
    assert.equal(result.structuredContent.value, 'sheet2-value');

    await mockServer.getTool('select_sheet').cb({ name: 'Third' }, ctx);
    result = await mockServer.getTool('get_cell').cb({ cell: 'C1' }, ctx);
    assert.equal(result.structuredContent.value, 'sheet3-value');
});

test('chain: write cell → bold → font → background → alignment → border', async () => {
    const ctx = createMockRequestContext('chain-scenarios-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'chain-styles.xlsx' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'Fully Chained' }, ctx);

    let r = await mockServer.getTool('set_cell_bold').cb({ ref: 'A1', bold: true }, ctx);
    assert.equal(r.structuredContent.bold, true);

    r = await mockServer.getTool('set_cell_font').cb({ ref: 'A1', fontSize: 16, fontName: 'Courier New', fontColor: 'FFFF0000' }, ctx);
    assert.equal(r.structuredContent.fontSize, 16);

    r = await mockServer.getTool('set_cell_background_color').cb({ ref: 'A1', color: 'FF00FF00' }, ctx);
    assert.equal(r.structuredContent.color, 'FF00FF00');

    r = await mockServer.getTool('set_cell_alignment').cb({ ref: 'A1', horizontal: 'center', vertical: 'middle' }, ctx);
    assert.equal(r.structuredContent.horizontal, 'center');

    r = await mockServer.getTool('set_cell_border').cb({ ref: 'A1', borderStyle: 'thick', sides: 'all' }, ctx);
    assert.equal(r.structuredContent.borderStyle, 'thick');

    const result = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(result.structuredContent.value, 'Fully Chained');
});

test('chain: create → write → copy sheet → verify data in both', async () => {
    const ctx = createMockRequestContext('chain-scenarios-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'chain-copy.xlsx' }, ctx);

    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'original-data' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'B1', value: 123 }, ctx);

    await mockServer.getTool('copy_sheet').cb({ sourceName: 'Sheet1', targetName: 'Sheet1_Copy' }, ctx);

    await mockServer.getTool('select_sheet').cb({ name: 'Sheet1_Copy' }, ctx);
    let r = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(r.structuredContent.value, 'original-data');
    r = await mockServer.getTool('get_cell').cb({ cell: 'B1' }, ctx);
    assert.equal(r.structuredContent.value, 123);

    await mockServer.getTool('select_sheet').cb({ name: 'Sheet1' }, ctx);
    r = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(r.structuredContent.value, 'original-data');
});

test('chain: cursor moves while writing → verify each position', async () => {
    const ctx = createMockRequestContext('chain-scenarios-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'chain-cursor.xlsx' }, ctx);

    await testContext.setCurrentCell('A1');
    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'pos-A1' }, ctx);
    await mockServer.getTool('move_cell_cursor').cb({ direction: 'right', steps: 1 }, ctx);

    await mockServer.getTool('set_cell').cb({ cell: 'B1', value: 'pos-B1' }, ctx);
    await mockServer.getTool('move_cell_cursor').cb({ direction: 'down', steps: 1 }, ctx);

    await mockServer.getTool('set_cell').cb({ cell: 'B2', value: 'pos-B2' }, ctx);

    const a1 = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(a1.structuredContent.value, 'pos-A1');
    const b1 = await mockServer.getTool('get_cell').cb({ cell: 'B1' }, ctx);
    assert.equal(b1.structuredContent.value, 'pos-B1');
    const b2 = await mockServer.getTool('get_cell').cb({ cell: 'B2' }, ctx);
    assert.equal(b2.structuredContent.value, 'pos-B2');
});

test('chain: rename sheet → verify data persists under new name', async () => {
    const ctx = createMockRequestContext('chain-scenarios-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'chain-rename.xlsx' }, ctx);

    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'before-rename' }, ctx);

    await mockServer.getTool('create_sheet').cb({ name: 'Temp' }, ctx);
    await mockServer.getTool('select_sheet').cb({ name: 'Temp' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'temp-data' }, ctx);

    await mockServer.getTool('rename_sheet').cb({ oldName: 'Temp', newName: 'Permanent' }, ctx);

    await mockServer.getTool('select_sheet').cb({ name: 'Permanent' }, ctx);
    const result = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(result.structuredContent.value, 'temp-data');

    await mockServer.getTool('select_sheet').cb({ name: 'Sheet1' }, ctx);
    const sheet1 = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(sheet1.structuredContent.value, 'before-rename');
});

test('chain: delete sheet → verify remaining sheets unaffected', async () => {
    const ctx = createMockRequestContext('chain-scenarios-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'chain-delete.xlsx' }, ctx);

    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'keep-me' }, ctx);

    await mockServer.getTool('create_sheet').cb({ name: 'Doomed' }, ctx);
    await mockServer.getTool('select_sheet').cb({ name: 'Doomed' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'delete-me' }, ctx);

    await mockServer.getTool('delete_sheet').cb({ name: 'Doomed' }, ctx);

    await mockServer.getTool('select_sheet').cb({ name: 'Sheet1' }, ctx);
    const result = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(result.structuredContent.value, 'keep-me');

    const listResult = await mockServer.getTool('list_sheets').cb({}, ctx);
    assert.ok(!listResult.structuredContent.sheets.includes('Doomed'));
});

test('chain: rapid set_cells + search + read', async () => {
    const ctx = createMockRequestContext('chain-scenarios-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'chain-rapid.xlsx' }, ctx);

    const cells = Array.from({ length: 15 }, (_, i) => ({
        cell: `A${i + 1}`,
        value: i % 3 === 0 ? `match-${i}` : `other-${i}`
    }));

    await mockServer.getTool('set_cells').cb({ cells }, ctx);

    const searchResult = await mockServer.getTool('search_cells').cb({ query: 'match-', matchCase: false }, ctx);
    assert.ok(Array.isArray(searchResult.structuredContent.matches));
    assert.equal(searchResult.structuredContent.matches.length, 5);

    for (const match of searchResult.structuredContent.matches) {
        const r = await mockServer.getTool('get_cell').cb({ cell: match.cell }, ctx);
        assert.ok(String(r.structuredContent.value).startsWith('match-'));
    }
});

export default function registerTests(testInstance: ReturnType<typeof baretest>) {
}
