/**
 * Integration tests for Cell operations flow tools.
 * Tests cell read/write, formulas, search, and cursor navigation.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { CellTools } from '../../src/tools/handleCell.js';

const test = baretest('Cell Operations Flow Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let cellTools: CellTools;

test('setup', async () => {
    mockServer = new MockMcpServer();
    testContext = createTestContext('cell-ops-flow-test');
    
    cellTools = new CellTools();
    cellTools.server = mockServer as any;
    cellTools.context = testContext;
    
    await cellTools.register([]);
    
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
    await createTool.cb({ filename: 'cell-test.xlsx' }, ctx);
});

test('teardown', async () => {
    await testContext.cleanup();
});

test('get_cell reads single cell value', async () => {
    const tool = mockServer.getTool('get_cell');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // First write a value
    const setTool = mockServer.getTool('set_cell');
    await setTool.cb({ cell: 'A1', value: 'Hello World' }, ctx);
    
    // Now read it back
    const result = await tool.cb({ cell: 'A1' }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.cell, 'A1');
    assert.equal(result.structuredContent.value, 'Hello World');
});

test('get_cell returns null for empty cell', async () => {
    const tool = mockServer.getTool('get_cell');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    const result = await tool.cb({ cell: 'Z999' }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.cell, 'Z999');
    // Empty cells may return null, undefined, or empty string
    assert.ok(result.structuredContent.value === null || result.structuredContent.value === undefined || result.structuredContent.value === '');
});

test('get_range reads rectangular range', async () => {
    const tool = mockServer.getTool('get_range');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // Write a 2x2 block
    const setTool = mockServer.getTool('set_cells');
    await setTool.cb({ 
        cells: [
            { cell: 'A1', value: 'A1' },
            { cell: 'B1', value: 'B1' },
            { cell: 'A2', value: 'A2' },
            { cell: 'B2', value: 'B2' }
        ]
    }, ctx);
    
    const result = await tool.cb({ range: 'A1:B2' }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.range, 'A1:B2');
    assert.ok(result.structuredContent.data);
    // Data should be TOON encoded or array
});

test('set_cell writes single cell', async () => {
    const tool = mockServer.getTool('set_cell');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    const result = await tool.cb({ cell: 'C1', value: 'Test Value' }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.cell, 'C1');
    assert.equal(result.structuredContent.value, 'Test Value');
    assert.equal(result.structuredContent.status, 'set');
    
    // Verify by reading back
    const getTool = mockServer.getTool('get_cell');
    const getResult = await getTool.cb({ cell: 'C1' }, ctx);
    assert.equal(getResult.structuredContent.value, 'Test Value');
});

test('set_cell writes number', async () => {
    const tool = mockServer.getTool('set_cell');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    const result = await tool.cb({ cell: 'D1', value: 42 }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.cell, 'D1');
    assert.equal(result.structuredContent.value, 42);
});

test('set_cell writes boolean', async () => {
    const tool = mockServer.getTool('set_cell');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    const result = await tool.cb({ cell: 'E1', value: true }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.cell, 'E1');
    assert.equal(result.structuredContent.value, true);
});

test('set_cell writes formula', async () => {
    const tool = mockServer.getTool('set_cell');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // Set up some values first
    const setTool = mockServer.getTool('set_cell');
    await setTool.cb({ cell: 'A10', value: 10 }, ctx);
    await setTool.cb({ cell: 'B10', value: 20 }, ctx);
    
    // Now set formula
    const result = await tool.cb({ cell: 'C10', value: '=A10+B10' }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.cell, 'C10');
    assert.equal(result.structuredContent.value, '=A10+B10');
});

test('set_cells writes multiple cells at once', async () => {
    const tool = mockServer.getTool('set_cells');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    const result = await tool.cb({ 
        cells: [
            { cell: 'F1', value: 'F1' },
            { cell: 'F2', value: 'F2' },
            { cell: 'F3', value: 'F3' }
        ]
    }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.count, 3);
    assert.equal(result.structuredContent.status, 'set');
    
    // Verify all written
    const getTool = mockServer.getTool('get_cell');
    for (let i = 1; i <= 3; i++) {
        const getResult = await getTool.cb({ cell: `F${i}` }, ctx);
        assert.equal(getResult.structuredContent.value, `F${i}`);
    }
});

test('set_formula sets formula explicitly', async () => {
    const tool = mockServer.getTool('set_formula');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // Set up values
    const setTool = mockServer.getTool('set_cell');
    await setTool.cb({ cell: 'A20', value: 5 }, ctx);
    await setTool.cb({ cell: 'B20', value: 15 }, ctx);
    
    const result = await tool.cb({ cell: 'C20', formula: '=A20*B20' }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.cell, 'C20');
    assert.equal(result.structuredContent.formula, '=A20*B20');
    assert.equal(result.structuredContent.status, 'set');
});

test('set_cell_type changes cell type', async () => {
    const tool = mockServer.getTool('set_cell_type');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // Write a number as string first
    const setTool = mockServer.getTool('set_cell');
    await setTool.cb({ cell: 'G1', value: '123' }, ctx);
    
    // Change to number type
    const result = await tool.cb({ cell: 'G1', type: 'number' }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.cell, 'G1');
    assert.equal(result.structuredContent.type, 'number');
    assert.equal(result.structuredContent.status, 'changed');
});

test('search_cells finds exact match', async () => {
    const tool = mockServer.getTool('search_cells');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // Set up searchable data
    const setTool = mockServer.getTool('set_cells');
    await setTool.cb({ 
        cells: [
            { cell: 'H1', value: 'apple' },
            { cell: 'H2', value: 'banana' },
            { cell: 'H3', value: 'apple pie' },
            { cell: 'I1', value: 'cherry' }
        ]
    }, ctx);
    
    const result = await tool.cb({ query: 'apple', matchCase: false }, ctx);
    
    assert.ok(result.structuredContent);
    assert.ok(Array.isArray(result.structuredContent.matches));
    assert.ok(result.structuredContent.matches.length >= 2); // H1 and H3
    assert.ok(result.structuredContent.matches.some((m: any) => m.cell === 'H1'));
    assert.ok(result.structuredContent.matches.some((m: any) => m.cell === 'H3'));
});

test('search_cells finds regex match', async () => {
    const tool = mockServer.getTool('search_cells');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    const result = await tool.cb({ query: '^a.*', regex: true }, ctx);
    
    assert.ok(result.structuredContent);
    assert.ok(Array.isArray(result.structuredContent.matches));
    // Should match 'apple' and 'apple pie'
    assert.ok(result.structuredContent.matches.length >= 2);
});

test('move_cell_cursor navigates right', async () => {
    const tool = mockServer.getTool('move_cell_cursor');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // Set cursor to A1
    await testContext.setCurrentCell('A1');
    
    const result = await tool.cb({ direction: 'right', steps: 3 }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.fromCell, 'A1');
    assert.equal(result.structuredContent.toCell, 'D1');
    assert.equal(result.structuredContent.direction, 'right');
    assert.equal(result.structuredContent.steps, 3);
    
    // Verify cursor moved
    const cursor = await testContext.getCurrentCell();
    assert.equal(cursor, 'D1');
});

test('move_cell_cursor navigates down', async () => {
    const tool = mockServer.getTool('move_cell_cursor');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // Set cursor to D1 (from previous test)
    await testContext.setCurrentCell('D1');
    
    const result = await tool.cb({ direction: 'down', steps: 2 }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.fromCell, 'D1');
    assert.equal(result.structuredContent.toCell, 'D3');
    assert.equal(result.structuredContent.direction, 'down');
    
    const cursor = await testContext.getCurrentCell();
    assert.equal(cursor, 'D3');
});

test('move_cell_cursor with UNTIL_BLANK stop condition', async () => {
    const tool = mockServer.getTool('move_cell_cursor');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // Set up data: A1=value, A2=value, A3=empty
    const setTool = mockServer.getTool('set_cells');
    await setTool.cb({ 
        cells: [
            { cell: 'A1', value: 'data1' },
            { cell: 'A2', value: 'data2' }
            // A3 left empty
        ]
    }, ctx);
    
    await testContext.setCurrentCell('A1');
    
    const result = await tool.cb({ 
        direction: 'down', 
        stopCondition: 'UNTIL_BLANK' 
    }, ctx);
    
    assert.ok(result.structuredContent);
    // Should stop at A3 (first blank)
    assert.equal(result.structuredContent.toCell, 'A3');
    assert.equal(result.structuredContent.stopReason, 'BLANK');
});

test('move_cell_cursor with UNTIL_ERROR stop condition', async () => {
    const tool = mockServer.getTool('move_cell_cursor');
    const ctx = createMockRequestContext('cell-ops-flow-test');
    
    // Set up: A10=ok, A11=#DIV/0!
    const setTool = mockServer.getTool('set_cells');
    await setTool.cb({ 
        cells: [
            { cell: 'A10', value: 'ok' },
            { cell: 'A11', value: '=1/0' } // This creates an error
        ]
    }, ctx);
    
    await testContext.setCurrentCell('A10');
    
    const result = await tool.cb({ 
        direction: 'down', 
        stopCondition: 'UNTIL_ERROR' 
    }, ctx);
    
    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.toCell, 'A11');
    assert.equal(result.structuredContent.stopReason, 'ERROR');
});

export default function registerTests(testInstance: ReturnType<typeof baretest>) {
    // Tests registered on shared instance
}