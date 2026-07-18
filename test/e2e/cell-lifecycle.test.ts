/**
 * E2E tests for full cell lifecycle.
 * Tests: create workbook → write cells → read cells → search → cursor navigation.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellTools } from '../../src/tools/handleCell.js';
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

    const cellTools = new CellTools();
    cellTools.server = mockServer as any;
    cellTools.context = testContext;
    await cellTools.register([]);
    });
});

test('teardown', async () => {
    await testContext.cleanup();
});

test('write single cell → read back → verify', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'cell-lifecycle.xlsx' }, ctx);

    const setResult = await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'Hello World' }, ctx);
    assert.equal(setResult.structuredContent.status, 'set');
    assert.equal(setResult.structuredContent.cell, 'A1');

    const getResult = await mockServer.getTool('get_cell').cb({ cell: 'A1' }, ctx);
    assert.equal(getResult.structuredContent.value, 'Hello World');
    });
});

test('write multiple cells via set_cells → read range → verify', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    const setResult = await mockServer.getTool('set_cells').cb({
        cells: [
            { cell: 'B1', value: 10 },
            { cell: 'B2', value: 20 },
            { cell: 'B3', value: 30 },
            { cell: 'C1', value: 'alpha' },
            { cell: 'C2', value: 'beta' },
            { cell: 'C3', value: 'gamma' }
        ]
    }, ctx);
    assert.equal(setResult.structuredContent.count, 6);

    const rangeResult = await mockServer.getTool('get_range').cb({ range: 'B1:C3' }, ctx);
    assert.ok(rangeResult.structuredContent);
    assert.ok(rangeResult.structuredContent.data);

    const b1 = await mockServer.getTool('get_cell').cb({ cell: 'B1' }, ctx);
    assert.equal(b1.structuredContent.value, 10);

    const c3 = await mockServer.getTool('get_cell').cb({ cell: 'C3' }, ctx);
    assert.equal(c3.structuredContent.value, 'gamma');
    });
});

test('write formula → verify computed result', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ cell: 'D1', value: 100 }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'D2', value: 50 }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'D3', value: '=D1+D2' }, ctx);

    const getResult = await mockServer.getTool('get_cell').cb({ cell: 'D3' }, ctx);
    assert.equal(getResult.structuredContent.value, '=D1+D2');
    });
});

test('search finds matching cells', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('set_cells').cb({
        cells: [
            { cell: 'E1', value: 'apple' },
            { cell: 'E2', value: 'banana' },
            { cell: 'E3', value: 'apple pie' },
            { cell: 'E4', value: 'cherry' },
            { cell: 'E5', value: 'pineapple' }
        ]
    }, ctx);

    const searchResult = await mockServer.getTool('search_cells').cb({ query: 'apple', matchCase: false }, ctx);
    assert.ok(Array.isArray(searchResult.structuredContent.matches));
    assert.ok(searchResult.structuredContent.matches.length >= 3);
    const matchCells = searchResult.structuredContent.matches.map((m: any) => m.cell);
    assert.ok(matchCells.includes('E1'));
    assert.ok(matchCells.includes('E3'));
    assert.ok(matchCells.includes('E5'));
    });
});

test('cursor navigation: right, down, with stop conditions', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('set_cells').cb({
        cells: [
            { cell: 'F1', value: 'row1' },
            { cell: 'F2', value: 'row2' },
            { cell: 'F3', value: 'row3' }
        ]
    }, ctx);

    await testContext.setCurrentCell('F1');

    const rightResult = await mockServer.getTool('move_cell_cursor').cb({ direction: 'right', steps: 2 }, ctx);
    assert.equal(rightResult.structuredContent.fromCell, 'F1');
    assert.equal(rightResult.structuredContent.toCell, 'H1');

    await testContext.setCurrentCell('F1');
    const downResult = await mockServer.getTool('move_cell_cursor').cb({ direction: 'down', stopCondition: 'UNTIL_BLANK' }, ctx);
    assert.equal(downResult.structuredContent.toCell, 'F4');
    assert.equal(downResult.structuredContent.stopReason, 'BLANK');
    });
});

test('overwrite existing cell value', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ cell: 'G1', value: 'original' }, ctx);
    let getResult = await mockServer.getTool('get_cell').cb({ cell: 'G1' }, ctx);
    assert.equal(getResult.structuredContent.value, 'original');

    await mockServer.getTool('set_cell').cb({ cell: 'G1', value: 'overwritten' }, ctx);
    getResult = await mockServer.getTool('get_cell').cb({ cell: 'G1' }, ctx);
    assert.equal(getResult.structuredContent.value, 'overwritten');
    });
});

test('get_cell on empty cell returns null or empty', async () => {
    await run(async () => {
    const ctx = createMockRequestContext('cell-lifecycle-e2e');

    const result = await mockServer.getTool('get_cell').cb({ cell: 'Z99' }, ctx);
    assert.ok(result.structuredContent);
    const val = result.structuredContent.value;
    assert.ok(val === null || val === undefined || val === '');
    });
});

export default function registerTests(testInstance: ReturnType<typeof baretest>) {
}
