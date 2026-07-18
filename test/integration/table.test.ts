import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { TableHandler } from '../../src/tools/handleTable.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Table Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let tableHandler: TableHandler;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('table-test');

        tableHandler = new TableHandler();
        tableHandler.server = mockServer as any;
        tableHandler.context = testContext;
        await tableHandler.register([]);

        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('table-test');
        await createTool.cb({ filename: 'table-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const cellWrite = new CellWriteHandler();
        cellWrite.server = mockServer as any;
        cellWrite.context = testContext;
        await cellWrite.register([]);
    });
});



test('create_excel_table creates a table in the range', async () => {
    await run(async () => {
        const tool = tableHandler.getTool('create_excel_table');
        const ctx = createMockRequestContext('table-test');

        const result = await tool.cb({
            range: 'A1:C3',
            name: 'TestTable',
            columns: ['Header1', 'Header2', 'Header3'],
            style: 'TableStyleMedium9'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'table-test.xlsx');
        assert.equal(result.structuredContent.sheet, 'Sheet1');
        assert.equal(result.structuredContent.name, 'TestTable');
        assert.equal(result.structuredContent.range, 'A1:C3');
        assert.equal(result.structuredContent.action, 'created');
    });
});

test('create_excel_table with minimal options', async () => {
    await run(async () => {
        const tool = tableHandler.getTool('create_excel_table');
        const ctx = createMockRequestContext('table-test');

        const result = await tool.cb({
            range: 'A2:C3',
            name: 'SimpleTable',
            columns: ['Header1', 'Header2', 'Header3']
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A2:C3');
        assert.equal(result.structuredContent.name, 'SimpleTable');
        assert.equal(result.structuredContent.action, 'created');
    });
});

test('create_excel_table requires name and columns', async () => {
    await run(async () => {
        const tool = tableHandler.getTool('create_excel_table');
        const ctx = createMockRequestContext('table-test');

        await assert.rejects(() => tool.cb({ range: 'A1:C3' }, ctx));
    });
});

test('add_autofilter adds autofilter to specified range', async () => {
    await run(async () => {
        const tool = tableHandler.getTool('add_autofilter');
        const ctx = createMockRequestContext('table-test');

        const result = await tool.cb({
            range: 'A1:C3'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'table-test.xlsx');
        assert.equal(result.structuredContent.sheet, 'Sheet1');
        assert.equal(result.structuredContent.range, 'A1:C3');
        assert.equal(result.structuredContent.action, 'added');
    });
});

test('add_autofilter on specified sheet', async () => {
    await run(async () => {
        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('table-test');
        await createTool.cb({ filename: 'table-test2.xlsx', createDefaultWorksheet: 'DataSheet' }, ctx);

        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ cell: 'A1', value: 'Name' }, ctx);
        await setCell.cb({ cell: 'B1', value: 'Age' }, ctx);
        await setCell.cb({ cell: 'A2', value: 'Alice' }, ctx);
        await setCell.cb({ cell: 'B2', value: '25' }, ctx);

        const tool = tableHandler.getTool('add_autofilter');
        const ctx2 = createMockRequestContext('table-test');

        const result = await tool.cb({
            workbook: 'table-test2.xlsx',
            sheet: 'DataSheet',
            range: 'A1:B2'
        }, ctx2);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'table-test2.xlsx');
        assert.equal(result.structuredContent.sheet, 'DataSheet');
        assert.equal(result.structuredContent.range, 'A1:B2');
        assert.equal(result.structuredContent.action, 'added');
    });
});

test('add_autofilter requires range', async () => {
    await run(async () => {
        const tool = tableHandler.getTool('add_autofilter');
        const ctx = createMockRequestContext('table-test');

        await assert.rejects(() => tool.cb({}, ctx));
    });
});

test('create_excel_table uses current workbook when not specified', async () => {
    await run(async () => {
        const tool = tableHandler.getTool('create_excel_table');
        const ctx = createMockRequestContext('table-test');

        const result = await tool.cb({
            range: 'A1:C3',
            name: 'CurrentWorkbookTable',
            columns: ['Header1', 'Header2', 'Header3']
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'table-test.xlsx');
        assert.equal(result.structuredContent.action, 'created');
    });
});

test('add_autofilter uses current sheet when not specified', async () => {
    await run(async () => {
        const tool = tableHandler.getTool('add_autofilter');
        const ctx = createMockRequestContext('table-test');

        const result = await tool.cb({
            range: 'A1:C3'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.sheet, 'Sheet1');
        assert.equal(result.structuredContent.action, 'added');
    });
});

test('create_excel_table with no open workbook', async () => {
    await run(async () => {
        const newTestContext = createTestContext('table-test-no-wb');
        const newTableHandler = new TableHandler();
        newTableHandler.server = mockServer as any;
        newTableHandler.context = newTestContext;
        await newTableHandler.register([]);
        const tool = newTableHandler.getTool('create_excel_table');
        const ctx = createMockRequestContext('table-test-no-wb');

        const result = await tool.cb({
            range: 'A1:C3',
            name: 'TestTable',
            columns: ['Header1', 'Header2', 'Header3']
        }, ctx);

        assert.strictEqual(result.structuredContent, undefined);
        assert(result.content.some(c => c.type === 'text' && c.text.includes('no workbook is currently open')));
    });
});

test('add_autofilter with unknown sheet', async () => {
    await run(async () => {
        const tool = tableHandler.getTool('add_autofilter');
        const ctx = createMockRequestContext('table-test');

        const result = await tool.cb({
            sheet: 'DoesNotExist',
            range: 'A1:C3'
        }, ctx);

        assert.strictEqual(result.structuredContent, undefined);
        assert(result.content.some(c => c.type === 'text' && c.text.includes('not found')));
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});
