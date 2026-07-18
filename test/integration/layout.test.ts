import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { LayoutHandler } from '../../src/tools/handleLayout.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { run } from '../../src/util/requestContext.js';

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let layoutHandler: LayoutHandler;

export default function (test: any) {

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('layout-test');

        layoutHandler = new LayoutHandler();
        layoutHandler.server = mockServer as any;
        layoutHandler.context = testContext;
        await layoutHandler.register([]);

        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const cellWrite = new CellWriteHandler();
        cellWrite.server = mockServer as any;
        cellWrite.context = testContext;
        await cellWrite.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('layout-test');
        await createTool.cb({ filename: 'layout-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ cell: 'A1', value: 'Test' }, ctx);
        await setCell.cb({ cell: 'B1', value: 'Data' }, ctx);
        await setCell.cb({ cell: 'C1', value: 'Row' }, ctx);
    });
});

test('merge_cells merges a range into a single cell', async () => {
    await run(async () => {
        const tool = mockServer.getTool('merge_cells');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({ range: 'A1:C1' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A1:C1');
    });
});

test('merge_cells with workbook and sheet parameters', async () => {
    await run(async () => {
        const tool = mockServer.getTool('merge_cells');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({
            workbook: 'layout-test.xlsx',
            sheet: 'Sheet1',
            range: 'A3:B3'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A3:B3');
    });
});

test('freeze_panes freezes at a cell reference', async () => {
    await run(async () => {
        const tool = mockServer.getTool('freeze_panes');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({ cellRef: 'B2' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.cellRef, 'B2');
    });
});

test('freeze_panes with workbook and sheet parameters', async () => {
    await run(async () => {
        const tool = mockServer.getTool('freeze_panes');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({
            workbook: 'layout-test.xlsx',
            sheet: 'Sheet1',
            cellRef: 'C3'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.cellRef, 'C3');
    });
});

test('set_column_width sets a column width', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_column_width');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({ column: 2, width: 15.5 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.column, 2);
        assert.equal(result.structuredContent.width, 15.5);
    });
});

test('set_column_width with workbook and sheet parameters', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_column_width');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({
            workbook: 'layout-test.xlsx',
            sheet: 'Sheet1',
            column: 3,
            width: 20.0
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.column, 3);
        assert.equal(result.structuredContent.width, 20.0);
    });
});

test('set_row_height sets a row height', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_row_height');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({ row: 5, height: 25.0 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.row, 5);
        assert.equal(result.structuredContent.height, 25.0);
    });
});

test('set_row_height with workbook and sheet parameters', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_row_height');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({
            workbook: 'layout-test.xlsx',
            sheet: 'Sheet1',
            row: 7,
            height: 30.0
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.row, 7);
        assert.equal(result.structuredContent.height, 30.0);
    });
});

test('merge_cells with no open workbook returns error message', async () => {
    await run(async () => {
        const freshContext = createTestContext('layout-test-merge-error');
        const layoutHandler = new LayoutHandler();
        layoutHandler.server = mockServer as any;
        layoutHandler.context = freshContext;
        await layoutHandler.register([]);

        const tool = mockServer.getTool('merge_cells');
        const ctx = createMockRequestContext('layout-test-merge-error');

        const result = await tool.cb({ range: 'A1:B1' }, ctx);

        assert.ok(result.content && result.content.some((c: any) => c.text && c.text.includes("no workbook is currently open")));
    });
});

test('freeze_panes with unknown sheet returns error message', async () => {
    await run(async () => {
        const freshContext = createTestContext('layout-test-freeze-error');
        const layoutHandler = new LayoutHandler();
        layoutHandler.server = mockServer as any;
        layoutHandler.context = freshContext;
        await layoutHandler.register([]);

        const tool = mockServer.getTool('freeze_panes');
        const ctx = createMockRequestContext('layout-test-freeze-error');

        const result = await tool.cb({
            workbook: 'layout-test.xlsx',
            sheet: 'NonExistentSheet',
            cellRef: 'B2'
        }, ctx);

        assert.ok(result.content && result.content.some((c: any) => c.text && c.text.includes("sheet 'NonExistentSheet' not found")));
    });
});

test('set_column_width with zero width', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_column_width');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({ column: 1, width: 0 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.column, 1);
        assert.equal(result.structuredContent.width, 0);
    });
});

test('set_row_height with zero height', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_row_height');
        const ctx = createMockRequestContext('layout-test');

        const result = await tool.cb({ row: 1, height: 0 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.row, 1);
        assert.equal(result.structuredContent.height, 0);
    });
});

test.after(async () => {
    await (await testContext).cleanup();
});

}