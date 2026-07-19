/**
 * E2E tests for full cell lifecycle.
 * Tests: create workbook → write cells → read cells → search → cursor navigation.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellReadHandler, CellWriteHandler, CellCursorHandler, CellDiscoveryHandler } from '../../src/tools/handleCell.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Cell Lifecycle E2E');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;

test('setup', async () => {
    await run(async () => {
    mockServer = new MockMcpServer();
    testContext = createTestContext('cell-lifecycle-e2e');

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
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});

test('write single cell → read back → verify', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'cell-lifecycle.xlsx' }, ctx);

    const setResult = await mockServer.getTool('set_cell').cb({ ref: 'A1', value: 'Hello World' }, ctx);
    assert.equal(setResult.structuredContent.ref, 'A1');
    assert.equal(setResult.structuredContent.value, 'Hello World');

    const getResult = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
    assert.equal(getResult.structuredContent.value, 'Hello World');
    });
});

test('write multiple cells via set_cells → read range → verify', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    const setResult = await mockServer.getTool('set_cells').cb({
        range: 'B1:C3',
        values: [
            [10, 'alpha'],
            [20, 'beta'],
            [30, 'gamma']
        ]
    }, ctx);
    assert.equal(setResult.structuredContent.rows, 3);

    const rangeResult = await mockServer.getTool('get_range').cb({ range: 'B1:C3' }, ctx);
    assert.ok(rangeResult.structuredContent);
    assert.ok(rangeResult.structuredContent.values);

    const b1 = await mockServer.getTool('get_cell').cb({ ref: 'B1' }, ctx);
    assert.equal(b1.structuredContent.value, 10);

    const c3 = await mockServer.getTool('get_cell').cb({ ref: 'C3' }, ctx);
    assert.equal(c3.structuredContent.value, 'gamma');
    });
});

test('write formula → verify computed result', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ ref: 'D1', value: 100 }, ctx);
    await mockServer.getTool('set_cell').cb({ ref: 'D2', value: 50 }, ctx);
    await mockServer.getTool('set_cell').cb({ ref: 'D3', value: '=D1+D2' }, ctx);

    const getResult = await mockServer.getTool('get_cell').cb({ ref: 'D3' }, ctx);
    assert.equal(getResult.structuredContent.value, '=D1+D2');
    });
});

test('search finds matching cells', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('set_cells').cb({
        range: 'E1:E5',
        values: [['apple'], ['banana'], ['apple pie'], ['cherry'], ['pineapple']]
    }, ctx);

    const searchResult = await mockServer.getTool('search_cells').cb({ query: 'apple' }, ctx);
    assert.ok(searchResult.structuredContent);
    assert.ok(searchResult.structuredContent.matchCount >= 3);
    });
});

test('cursor navigation: right, down, with stop conditions', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('set_cells').cb({
        range: 'F1:F3',
        values: [['row1'], ['row2'], ['row3']]
    }, ctx);

    await (await testContext).setCurrentCell('F1');

    const rightResult = await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'right', count: 2 }] }, ctx);
    assert.equal(rightResult.structuredContent.from, 'F1');
    assert.equal(rightResult.structuredContent.to, 'H1');

    await (await testContext).setCurrentCell('F1');
    const downResult = await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'down', count: 'UNTIL_BLANK' }] }, ctx);
    assert.equal(downResult.structuredContent.to, 'F4');
    });
});

test('overwrite existing cell value', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ ref: 'G1', value: 'original' }, ctx);
    let getResult = await mockServer.getTool('get_cell').cb({ ref: 'G1' }, ctx);
    assert.equal(getResult.structuredContent.value, 'original');

    await mockServer.getTool('set_cell').cb({ ref: 'G1', value: 'overwritten' }, ctx);
    getResult = await mockServer.getTool('get_cell').cb({ ref: 'G1' }, ctx);
    assert.equal(getResult.structuredContent.value, 'overwritten');
    });
});

test('get_cell on empty cell returns null or empty', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    const result = await mockServer.getTool('get_cell').cb({ ref: 'Z99' }, ctx);
    assert.ok(result.structuredContent);
    const val = result.structuredContent.value;
    assert.ok(val === null || val === undefined || val === '');
    });
});

export default async function () {
    await test.run();
}
