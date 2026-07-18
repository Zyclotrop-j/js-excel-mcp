import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { ChartHandler } from '../../src/tools/handleChart.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Chart Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let chartHandler: ChartHandler;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('chart-test');

        chartHandler = new ChartHandler();
        chartHandler.server = mockServer as any;
        chartHandler.context = testContext;
        await chartHandler.register([]);

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
        const ctx = createMockRequestContext('chart-test');
        await createTool.cb({ filename: 'chart-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const setCells = mockServer.getTool('set_cells');
        await setCells.cb({
            range: 'A1:B10',
            values: [
                ['Category', 'Value'],
                ['A', 10],
                ['B', 20],
                ['C', 30],
                ['D', 40],
                ['E', 50],
                ['F', 60],
                ['G', 70],
                ['H', 80],
                ['I', 90]
            ]
        }, ctx);
    });
});

test('add_bar_chart adds a clustered column/bar chart', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_bar_chart');
        const ctx = createMockRequestContext('chart-test');

        const result = await tool.cb({
            dataRange: 'A1:B10',
            anchorCell: 'D1',
            title: 'Bar Chart Test'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.anchorCell, 'D1');
        assert.equal(result.structuredContent.title, 'Bar Chart Test');
    });
});

test('add_bar_chart with optional title omitted', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_bar_chart');
        const ctx = createMockRequestContext('chart-test');

        const result = await tool.cb({
            dataRange: 'A1:B10',
            anchorCell: 'D2'
            // title omitted to test optional behavior
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.anchorCell, 'D2');
        assert.equal(result.structuredContent.title, undefined);
    });
});

test('add_bar_chart with no open workbook (separate context)', async () => {
    await run(async () => {
        // Create a separate test context with a different userId to ensure no workbook is open
        const separateTestContext = createTestContext('chart-test-no-wb');
        const separateTool = mockServer.getTool('add_bar_chart');
        const separateCtx = createMockRequestContext('chart-test-no-wb');

        const result = await separateTool.cb({
            dataRange: 'A1:B10',
            anchorCell: 'D1'
        }, separateCtx);

        assert.ok(result.content);
        assert.ok(result.content.some((c:any)=>c.text.includes('no workbook is currently open')));
    });
});

test('add_bar_chart with row direction and stacking', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_bar_chart');
        const ctx = createMockRequestContext('chart-test');

        const result = await tool.cb({
            dataRange: 'A1:B10',
            anchorCell: 'E1',
            title: 'Row Stacked Chart',
            barDir: 'row',
            grouping: 'stacked',
            widthPx: 600,
            heightPx: 400
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.anchorCell, 'E1');
        assert.equal(result.structuredContent.title, 'Row Stacked Chart');
    });
});

test('add_line_chart adds a line chart', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_line_chart');
        const ctx = createMockRequestContext('chart-test');

        const result = await tool.cb({
            dataRange: 'A1:B10',
            anchorCell: 'D2',
            title: 'Line Chart Test'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.anchorCell, 'D2');
        assert.equal(result.structuredContent.title, 'Line Chart Test');
    });
});

test('add_line_chart with smooth option', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_line_chart');
        const ctx = createMockRequestContext('chart-test');

        const result = await tool.cb({
            dataRange: 'A1:B10',
            anchorCell: 'E2',
            title: 'Smooth Line Chart',
            smooth: true,
            widthPx: 500,
            heightPx: 350
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.anchorCell, 'E2');
        assert.equal(result.structuredContent.title, 'Smooth Line Chart');
    });
});

test('add_bar_chart requires dataRange parameter', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_bar_chart');
        const ctx = createMockRequestContext('chart-test');

        const result = await tool.cb({
            anchorCell: 'D1',
            title: 'Missing Data Range'
        }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes('no workbook')));
    });
});

test('add_bar_chart with invalid dataRange fails', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_bar_chart');
        const ctx = createMockRequestContext('chart-test');

        const result = await tool.cb({
            dataRange: 'INVALID',
            anchorCell: 'D1'
        }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes('invalid dataRange format')));
    });
});

test('add_line_chart with invalid dataRange fails', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_line_chart');
        const ctx = createMockRequestContext('chart-test');

        const result = await tool.cb({
            dataRange: 'INVALID',
            anchorCell: 'D1'
        }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes('invalid dataRange format')));
    });
});

export default async function () {
    await test.run();
}
