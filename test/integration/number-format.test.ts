import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { NumberFormatHandler } from '../../src/tools/handleNumberFormat.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Number Format Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('number-format-test');

        const numberFormatHandler = new NumberFormatHandler();
        numberFormatHandler.server = mockServer as any;
        numberFormatHandler.context = testContext;
        await numberFormatHandler.register([]);

        const cellWriteHandler = new CellWriteHandler();
        cellWriteHandler.server = mockServer as any;
        cellWriteHandler.context = testContext;
        await cellWriteHandler.register([]);

        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('number-format-test');
        await createTool.cb({ filename: 'number-format-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ cell: 'A1', value: 1234.5 }, ctx);
        await setCell.cb({ cell: 'B1', value: 0.25 }, ctx);
        await setCell.cb({ cell: 'C1', value: 45000 }, ctx);
        await setCell.cb({ cell: 'D1', value: 12345.678 }, ctx);
    });
});

test('set_cell_currency applies currency format and echoes input', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_currency');
        const ctx = createMockRequestContext('number-format-test');

        const result = await tool.cb({ ref: 'A1', symbol: 'EUR', decimals: 2 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.format, 'currency');
    });
});

test('set_cell_currency defaults symbol and decimals', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_currency');
        const ctx = createMockRequestContext('number-format-test');

        const result = await tool.cb({ ref: 'A1' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.format, 'currency');
    });
});

test('set_cell_percent applies percent format and echoes input', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_percent');
        const ctx = createMockRequestContext('number-format-test');

        const result = await tool.cb({ ref: 'B1', decimals: 1 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'B1');
        assert.equal(result.structuredContent.format, 'percent');
    });
});

test('set_cell_percent defaults decimals to zero', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_percent');
        const ctx = createMockRequestContext('number-format-test');

        const result = await tool.cb({ ref: 'B1' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'B1');
        assert.equal(result.structuredContent.format, 'percent');
    });
});

test('set_cell_date_format applies date format and echoes input', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_date_format');
        const ctx = createMockRequestContext('number-format-test');

        const result = await tool.cb({ ref: 'C1', format: 'date' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'C1');
        assert.equal(result.structuredContent.format, 'date');
    });
});

test('set_cell_date_format applies datetime format and echoes input', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_date_format');
        const ctx = createMockRequestContext('number-format-test');

        const result = await tool.cb({ ref: 'C1', format: 'datetime' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'C1');
        assert.equal(result.structuredContent.format, 'datetime');
    });
});

test('set_cell_date_format applies time format and echoes input', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_date_format');
        const ctx = createMockRequestContext('number-format-test');

        const result = await tool.cb({ ref: 'C1', format: 'time' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'C1');
        assert.equal(result.structuredContent.format, 'time');
    });
});

test('set_cell_number_format applies custom format and echoes input', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_number_format');
        const ctx = createMockRequestContext('number-format-test');

        const result = await tool.cb({ ref: 'D1', formatString: '#,##0.00' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'D1');
        assert.equal(result.structuredContent.format, '#,##0.00');
    });
});

test('set_cell_number_format applies percent custom format and echoes input', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_number_format');
        const ctx = createMockRequestContext('number-format-test');

        const result = await tool.cb({ ref: 'D1', formatString: '0.00%' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'D1');
        assert.equal(result.structuredContent.format, '0.00%');
    });
});

test('set_cell_date_format rejects invalid format value', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_date_format');
        const ctx = createMockRequestContext('number-format-test');

        let threw = false;
        try {
            await tool.cb({ ref: 'C1', format: 'weekday' }, ctx);
        } catch (e) {
            threw = true;
        }
        assert.ok(threw, 'expected invalid enum value to be rejected by the input schema');
    });
});

test('set_cell_currency errors when no workbook is open', async () => {
    await run(async () => {
        const otherContext = createTestContext('number-format-no-wb');
        const otherServer = new MockMcpServer();

        const numberFormatHandler = new NumberFormatHandler();
        numberFormatHandler.server = otherServer as any;
        numberFormatHandler.context = otherContext;
        await numberFormatHandler.register([]);

        const tool = otherServer.getTool('set_cell_currency');
        const ctx = createMockRequestContext('number-format-no-wb');

        const result = await tool.cb({ ref: 'A1', symbol: '$' }, ctx);

        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));

        await otherContext.cleanup();
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});

export default async function () {
    await test.run();
}
