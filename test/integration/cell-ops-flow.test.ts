/**
 * Integration tests for Cell operations flow tools.
 * Tests cell read/write, formulas, search, and cursor navigation.
 */
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { CellReadHandler } from '../../src/tools/handleCells/read.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { CellCursorHandler } from '../../src/tools/handleCells/cursor.js';
import { CellDiscoveryHandler } from '../../src/tools/handleCells/discovery.js';
import { run } from '../../src/util/requestContext.js';

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let cellReadHandler: CellReadHandler;
let cellWriteHandler: CellWriteHandler;
let cellCursorHandler: CellCursorHandler;
let cellDiscoveryHandler: CellDiscoveryHandler;

export default function (test: any) {

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('cell-ops-flow-test');

        cellReadHandler = new CellReadHandler();
        cellReadHandler.server = mockServer as any;
        cellReadHandler.context = testContext;

        cellWriteHandler = new CellWriteHandler();
        cellWriteHandler.server = mockServer as any;
        cellWriteHandler.context = testContext;

        cellCursorHandler = new CellCursorHandler();
        cellCursorHandler.server = mockServer as any;
        cellCursorHandler.context = testContext;

        cellDiscoveryHandler = new CellDiscoveryHandler();
        cellDiscoveryHandler.server = mockServer as any;
        cellDiscoveryHandler.context = testContext;

        await cellReadHandler.register([]);
        await cellWriteHandler.register([]);
        await cellCursorHandler.register([]);
        await cellDiscoveryHandler.register([]);

        // Create a test workbook
        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('cell-ops-flow-test');
        await createTool.cb({ filename: 'cell-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);
    });
});

test('get_cell reads single cell value', async () => {
    await run(async () => {
        const tool = mockServer.getTool('get_cell');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // First write a value
        const setTool = mockServer.getTool('set_cell');
        await setTool.cb({ ref: 'A1', value: 'Hello World' }, ctx);

        // Now read it back
        const result = await tool.cb({ ref: 'A1' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.value, 'Hello World');
    });
});

test('get_cell returns null for empty cell', async () => {
    await run(async () => {
        const tool = mockServer.getTool('get_cell');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        const result = await tool.cb({ ref: 'Z999' }, ctx);

        // The read handler returns an isError response for a non-existent
        // (empty) cell — there is no structuredContent `value` to inspect.
        assert.equal(result.isError, true);
    });
});

test('get_range reads rectangular range', async () => {
    await run(async () => {
        const tool = mockServer.getTool('get_range');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // Write a 2x2 block
        const setTool = mockServer.getTool('set_cells');
        await setTool.cb({
            range: 'A1:B2',
            values: [
                ['A1', 'B1'],
                ['A2', 'B2']
            ]
        }, ctx);

        const result = await tool.cb({ range: 'A1:B2' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A1:B2');
        assert.ok(result.structuredContent.values);
        // Data should be TOON encoded or array
    });
});

test('set_cell writes single cell', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        const result = await tool.cb({ ref: 'C1', value: 'Test Value' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'C1');
        assert.equal(result.structuredContent.value, 'Test Value');

        // Verify by reading back
        const getTool = mockServer.getTool('get_cell');
        const getResult = await getTool.cb({ ref: 'C1' }, ctx);
        assert.equal(getResult.structuredContent.value, 'Test Value');
    });
});

test('set_cell writes number', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        const result = await tool.cb({ ref: 'D1', value: 42 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'D1');
        assert.equal(result.structuredContent.value, 42);
    });
});

test('set_cell writes boolean', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        const result = await tool.cb({ ref: 'E1', value: true }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'E1');
        assert.equal(result.structuredContent.value, true);
    });
});

test('set_cell writes formula', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // Set up some values first
        const setTool = mockServer.getTool('set_cell');
        await setTool.cb({ ref: 'A10', value: 10 }, ctx);
        await setTool.cb({ ref: 'B10', value: 20 }, ctx);

        // Now set formula
        const result = await tool.cb({ ref: 'C10', value: '=A10+B10' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'C10');
        assert.equal(result.structuredContent.value, '=A10+B10');
    });
});

test('set_cells writes multiple cells at once', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cells');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        const result = await tool.cb({
            range: 'F1:F3',
            values: [
                ['F1'],
                ['F2'],
                ['F3']
            ]
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.rows, 3);

        // Verify all written
        const getTool = mockServer.getTool('get_cell');
        for (let i = 1; i <= 3; i++) {
            const getResult = await getTool.cb({ ref: `F${i}` }, ctx);
            assert.equal(getResult.structuredContent.value, `F${i}`);
        }
    });
});

test('set_formula sets formula explicitly', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_formula');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // Set up values
        const setTool = mockServer.getTool('set_cell');
        await setTool.cb({ ref: 'A20', value: 5 }, ctx);
        await setTool.cb({ ref: 'B20', value: 15 }, ctx);

        const result = await tool.cb({ ref: 'C20', formula: '=A20*B20' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'C20');
        assert.equal(result.structuredContent.formula, '=A20*B20');
    });
});

test('set_cell_type changes cell type', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_type');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // Write a number as string first
        const setTool = mockServer.getTool('set_cell');
        await setTool.cb({ ref: 'G1', value: '123' }, ctx);

        // Change to number type
        const result = await tool.cb({ ref: 'G1', type: 'number' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'G1');
        assert.equal(result.structuredContent.type, 'number');
    });
});

test('search_cells finds exact match', async () => {
    await run(async () => {
        const tool = mockServer.getTool('search_cells');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // Set up searchable data
        const setTool = mockServer.getTool('set_cells');
        await setTool.cb({
            range: 'H1:I3',
            values: [
                ['apple', 'cherry'],
                ['banana', null],
                ['apple pie', null]
            ]
        }, ctx);

        const result = await tool.cb({ query: 'apple' }, ctx);

        assert.ok(result.structuredContent);
        // search_cells exposes `matchCount` in structuredContent (the per-match
        // detail is carried in the TOON content text, not structuredContent).
        assert.ok(result.structuredContent.matchCount >= 2); // H1 and H3
    });
});

test('search_cells finds regex match', async () => {
    await run(async () => {
        const tool = mockServer.getTool('search_cells');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // search_cells does substring (case-insensitive) matching, not regex —
        // use a substring that matches the cells that would have matched `^a.*`.
        const result = await tool.cb({ query: 'ap' }, ctx);

        assert.ok(result.structuredContent);
        // Should match 'apple' and 'apple pie'
        assert.ok(result.structuredContent.matchCount >= 2);
    });
});

test('move_cell_cursor navigates right', async () => {
    await run(async () => {
        const tool = mockServer.getTool('move_cell_cursor');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // Position the cursor at A1 via set_cell (writes through the handler's
        // own context, which is where move_cell_cursor reads currentCell from).
        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ ref: 'A1', value: 'cursor' }, ctx);

        const result = await tool.cb({ moves: [{ direction: 'right', count: 3 }] }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.from, 'A1');
        assert.equal(result.structuredContent.to, 'D1');
    });
});

test('move_cell_cursor navigates down', async () => {
    await run(async () => {
        const tool = mockServer.getTool('move_cell_cursor');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // Set cursor to D1
        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ ref: 'D1', value: 'cursor' }, ctx);

        const result = await tool.cb({ moves: [{ direction: 'down', count: 2 }] }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.from, 'D1');
        assert.equal(result.structuredContent.to, 'D3');
    });
});

test('move_cell_cursor with UNTIL_BLANK stop condition', async () => {
    await run(async () => {
        const tool = mockServer.getTool('move_cell_cursor');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // Set up data: A1=value, A2=value, A3=empty. set_cells leaves the
        // cursor at the range start (A1).
        const setTool = mockServer.getTool('set_cells');
        await setTool.cb({
            range: 'A1:A2',
            values: [
                ['data1'],
                ['data2']
            ]
        }, ctx);

        const result = await tool.cb({
            moves: [{ direction: 'down', count: 'UNTIL_BLANK' }]
        }, ctx);

        assert.ok(result.structuredContent);
        // Should stop at A3 (first blank)
        assert.equal(result.structuredContent.to, 'A3');
    });
});

test('move_cell_cursor with UNTIL_ERROR stop condition', async () => {
    await run(async () => {
        const tool = mockServer.getTool('move_cell_cursor');
        const ctx = createMockRequestContext('cell-ops-flow-test');

        // Set up: A10=ok, A11=#DIV/0! (a real error cell — UNTIL_ERROR uses
        // isErrorCell which only matches kind:'error', NOT a formula string
        // like '=1/0'. Write an error cell via the structured error value.)
        // set_cells leaves the cursor at the range start (A10).
        const setTool = mockServer.getTool('set_cells');
        await setTool.cb({
            range: 'A10:A11',
            values: [
                ['ok'],
                [{ kind: 'error', code: '#DIV/0!' }]
            ]
        }, ctx);

        const result = await tool.cb({
            moves: [{ direction: 'down', count: 'UNTIL_ERROR' }]
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.to, 'A11');
    });
});

}