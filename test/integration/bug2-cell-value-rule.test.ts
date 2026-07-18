/**
 * BUG-2: add_cell_value_rule value param rejects numbers despite documentation suggesting union type.
 *
 * The Zod schema for `value` is `z.string()` but users naturally pass numbers
 * for numeric comparisons (e.g. value: 70000). The schema should accept
 * z.union([z.string(), z.number(), z.boolean()]) and coerce to string internally.
 */
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { ConditionalFormatHandler } from '../../src/tools/handleConditionalFormat.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { run } from '../../src/util/requestContext.js';
import z from 'zod';

async function setupBug2() {
    const mockServer = new MockMcpServer();
    let testContext;

    await run(async () => {
        testContext = await createTestContext('bug2-cvr-test');
        const cfHandler = new ConditionalFormatHandler();
        cfHandler.server = mockServer as any;
        cfHandler.context = testContext;
        await cfHandler.register([]);

        const wbTools = new WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const ctx = createMockRequestContext('bug2-cvr-test');
        await mockServer.getTool('create_new_workbook').cb({ filename: 'bug2-test.xlsx' }, ctx);
    });

    return { mockServer, testContext };
}

export default function (test: any) {

test('BUG-2: schema accepts numeric value for add_cell_value_rule', async () => {
    const { mockServer, testContext } = await setupBug2();
    try {
        const tool = mockServer.getTool('add_cell_value_rule');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse({
            range: 'C2:C4',
            operator: 'greaterThan',
            value: 70000
        });

        assert.equal(result.success, true, 'Numeric value should pass validation after fix');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-2: schema accepts string value for add_cell_value_rule', async () => {
    const { mockServer, testContext } = await setupBug2();
    try {
        const tool = mockServer.getTool('add_cell_value_rule');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse({
            range: 'C2:C4',
            operator: 'greaterThan',
            value: '70000'
        });

        assert.equal(result.success, true, 'String value should pass validation');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-2: schema accepts boolean value for add_cell_value_rule', async () => {
    const { mockServer, testContext } = await setupBug2();
    try {
        const tool = mockServer.getTool('add_cell_value_rule');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse({
            range: 'C2:C4',
            operator: 'equal',
            value: true
        });

        assert.equal(result.success, true, 'Boolean value should pass validation after fix');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-2: schema accepts numeric value2 for between operator', async () => {
    const { mockServer, testContext } = await setupBug2();
    try {
        const tool = mockServer.getTool('add_cell_value_rule');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse({
            range: 'C2:C4',
            operator: 'between',
            value: 10000,
            value2: 90000
        });

        assert.equal(result.success, true, 'Numeric value/value2 should pass validation after fix');
    } finally {
        await (await testContext).cleanup();
    }
});

}
