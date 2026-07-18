import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { OutlineHandler } from '../../src/tools/handleOutline.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Outline Flow Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let outlineHandler: OutlineHandler;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = await createTestContext('outline-test');

        outlineHandler = new OutlineHandler();
        outlineHandler.server = mockServer as any;
        outlineHandler.context = testContext;
        await outlineHandler.register([]);

        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('outline-test');
        await createTool.cb({ filename: 'outline-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});

test('group_rows groups a range of rows', async () => {
    await run(async () => {
        const tool = mockServer.getTool('group_rows');
        const ctx = createMockRequestContext('outline-test');

        const result = await tool.cb({ startRow: 1, endRow: 5, collapsed: false }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.startRow, 1);
        assert.equal(result.structuredContent.endRow, 5);
        assert.equal(result.structuredContent.collapsed, false);
    });
});

test('group_rows groups rows with collapsed state', async () => {
    await run(async () => {
        const tool = mockServer.getTool('group_rows');
        const ctx = createMockRequestContext('outline-test');

        const result = await tool.cb({ startRow: 10, endRow: 15, collapsed: true }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.startRow, 10);
        assert.equal(result.structuredContent.endRow, 15);
        assert.equal(result.structuredContent.collapsed, true);
    });
});

test('group_columns groups a range of columns', async () => {
    await run(async () => {
        const tool = mockServer.getTool('group_columns');
        const ctx = createMockRequestContext('outline-test');

        const result = await tool.cb({ startCol: 2, endCol: 6, collapsed: false }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.startCol, 2);
        assert.equal(result.structuredContent.endCol, 6);
        assert.equal(result.structuredContent.collapsed, false);
    });
});

test('group_columns groups columns with collapsed state', async () => {
    await run(async () => {
        const tool = mockServer.getTool('group_columns');
        const ctx = createMockRequestContext('outline-test');

        const result = await tool.cb({ startCol: 3, endCol: 8, collapsed: true }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.startCol, 3);
        assert.equal(result.structuredContent.endCol, 8);
        assert.equal(result.structuredContent.collapsed, true);
    });
});

test('group_rows fails with no open workbook', async () => {
    await run(async () => {
        const tool = mockServer.getTool('group_rows');
        const ctx = createMockRequestContext('outline-test');

        // Clear the workbook for this user context
        await testContext.cleanup();

        const result = await tool.cb({ startRow: 1, endRow: 5 }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));
    });
});

test('group_columns fails with no open workbook', async () => {
    await run(async () => {
        const tool = mockServer.getTool('group_columns');
        const ctx = createMockRequestContext('outline-test');

        // Clear the workbook for this user context
        await testContext.cleanup();

        const result = await tool.cb({ startCol: 1, endCol: 5 }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));
    });
});

export default async function () {
    await test.run();
}
