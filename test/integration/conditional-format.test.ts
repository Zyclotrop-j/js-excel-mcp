import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { ConditionalFormatHandler } from '../../src/tools/handleConditionalFormat.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Conditional Formatting Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let conditionalFormatHandler: ConditionalFormatHandler;

let workbookTools: any;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('conditional-format-test');

        conditionalFormatHandler = new ConditionalFormatHandler();
        conditionalFormatHandler.server = mockServer as any;
        conditionalFormatHandler.context = testContext;
        await conditionalFormatHandler.register([]);

        const workbookToolsModule = await import('../../src/tools/handleWorkbook.js');
        workbookTools = new workbookToolsModule.WorkbookTools();
        workbookTools.server = mockServer as any;
        workbookTools.context = testContext;
        workbookTools.expressApp = { get: () => {}, post: () => {} } as any;
        workbookTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await workbookTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('conditional-format-test');
        await createTool.cb({ filename: 'conditional-format-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const setCell = mockServer.getTool('set_cell');
        const numbers = [
            ['10', '20', '30', '40'],
            ['5', '15', '25', '35'],
            ['12', '22', '32', '42'],
            ['7', '17', '27', '37']
        ];
        for (let row = 0; row < numbers.length; row++) {
            for (let col = 0; col < numbers[row].length; col++) {
                const cellRef = `${String.fromCharCode(65 + col)}${row + 1}`;
                await setCell.cb({ cell: cellRef, value: numbers[row][col] }, ctx);
            }
        }
    });
});

test('teardown', async () => {
    await testContext.cleanup();
});

test('add_color_scale happy path', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_color_scale');
        const ctx = createMockRequestContext('conditional-format-test');

        const result = await tool.cb({ range: 'A1:D4', lowColor: 'FF0000', midColor: 'FFFF00', highColor: '00FF00' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A1:D4');
        assert.equal(result.structuredContent.lowColor, 'FF0000');
        assert.equal(result.structuredContent.midColor, 'FFFF00');
        assert.equal(result.structuredContent.highColor, '00FF00');
    });
});

test('add_color_scale with defaults', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_color_scale');
        const ctx = createMockRequestContext('conditional-format-test');

        const result = await tool.cb({ range: 'B2:C3' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'B2:C3');
        assert.ok(result.structuredContent.lowColor);
        assert.ok(result.structuredContent.midColor);
        assert.ok(result.structuredContent.highColor);
    });
});

test('add_cell_value_rule greaterThan', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_cell_value_rule');
        const ctx = createMockRequestContext('conditional-format-test');

        const result = await tool.cb({ range: 'A1:D4', operator: 'greaterThan', value: '20' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A1:D4');
        assert.equal(result.structuredContent.operator, 'greaterThan');
        assert.equal(result.structuredContent.value, '20');
    });
});

test('add_cell_value_rule lessThan', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_cell_value_rule');
        const ctx = createMockRequestContext('conditional-format-test');

        const result = await tool.cb({ range: 'A1:D4', operator: 'lessThan', value: '10' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A1:D4');
        assert.equal(result.structuredContent.operator, 'lessThan');
        assert.equal(result.structuredContent.value, '10');
    });
});

test('add_cell_value_rule equal', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_cell_value_rule');
        const ctx = createMockRequestContext('conditional-format-test');

        const result = await tool.cb({ range: 'A1:D4', operator: 'equal', value: '25' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A1:D4');
        assert.equal(result.structuredContent.operator, 'equal');
        assert.equal(result.structuredContent.value, '25');
    });
});

test('add_cell_value_rule between with value2', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_cell_value_rule');
        const ctx = createMockRequestContext('conditional-format-test');

        const result = await tool.cb({ range: 'A1:D4', operator: 'between', value: '15', value2: '30' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A1:D4');
        assert.equal(result.structuredContent.operator, 'between');
        assert.equal(result.structuredContent.value, '15');
    });
});

test('add_color_scale custom range', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_color_scale');
        const ctx = createMockRequestContext('conditional-format-test');

        const result = await tool.cb({ range: 'C2:D4', lowColor: 'FF8888', midColor: 'FFBB88', highColor: '88FF88' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'C2:D4');
        assert.equal(result.structuredContent.lowColor, 'FF8888');
        assert.equal(result.structuredContent.midColor, 'FFBB88');
        assert.equal(result.structuredContent.highColor, '88FF88');
    });
});

test('add_cell_value_rule with fillColor happy path', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_cell_value_rule');
        const ctx = createMockRequestContext('conditional-format-test');

        const result = await tool.cb({ range: 'A1:D4', operator: 'greaterThan', value: '20', fillColor: 'FFFF0000' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A1:D4');
        assert.equal(result.structuredContent.operator, 'greaterThan');
        assert.equal(result.structuredContent.value, '20');
    });
});

test('add_cell_value_rule with unknown sheet (error)', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_cell_value_rule');
        const ctx = createMockRequestContext('conditional-format-test');

        const result = await tool.cb({ range: 'A1:D4', operator: 'greaterThan', value: '20', sheet: 'NoSuchSheet' }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c:any)=> c.text && c.text.includes("sheet 'NoSuchSheet' not found")));
    });
});

test('add_color_scale without open workbook (error)', async () => {
    await run(async () => {
        const testContextNoWb = createTestContext('cf-test-no-wb');
        const conditionalFormatHandlerNoWb = new ConditionalFormatHandler();
        conditionalFormatHandlerNoWb.context = testContextNoWb;
        await conditionalFormatHandlerNoWb.register([]);

        const toolNoWb = new MockMcpServer().getTool('add_color_scale');

        const ctxNoWb = createMockRequestContext('cf-test-no-wb');

        const result = await toolNoWb.cb({ range: 'A1:D4', lowColor: 'FF0000', midColor: 'FFFF00', highColor: '00FF00' }, ctxNoWb);

        assert.ok(result.content);
        assert.ok(result.content.some((c:any)=> c.text && c.text.includes('no workbook is currently open')));
    });
});

test('teardown', async () => {
    await testContext.cleanup();
});

export default async function () {
    await test.run();
}
