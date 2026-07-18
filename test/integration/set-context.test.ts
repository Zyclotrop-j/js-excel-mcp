import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { CreateWorksheetHandler } from '../../src/tools/handleWorksheet.js';

const test = baretest('Set Context Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('set-context-test');

        const setContextHandler = new SetContextHandler();
        setContextHandler.server = mockServer as any;
        setContextHandler.context = testContext;
        await setContextHandler.register([]);

        const wbTools = new WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('set-context-test');
        await createTool.cb({ filename: 'set-context-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const createSheet = mockServer.getTool('create_sheet');
        await createSheet.cb({ name: 'Sheet2' }, ctx);
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});

test('set_context with no args echoes current context', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_context');
        const ctx = createMockRequestContext('set-context-test');

        const result = await tool.cb({}, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.workbook, 'set-context-test.xlsx');
        assert.equal(result.structuredContent.sheet, 'Sheet1');
        assert.equal((result.structuredContent.changed as string[]).length, 0);
    });
});

test('set_context sets the current workbook', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_context');
        const ctx = createMockRequestContext('set-context-test');

        const result = await tool.cb({ workbook: 'set-context-test.xlsx' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.workbook, 'set-context-test.xlsx');
        assert.ok((result.structuredContent.changed as string[]).includes('workbook'));
    });
});

test('set_context sets an existing sheet', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_context');
        const ctx = createMockRequestContext('set-context-test');

        const result = await tool.cb({ sheet: 'Sheet2' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.sheet, 'Sheet2');
        assert.ok((result.structuredContent.changed as string[]).includes('sheet'));
    });
});

test('set_context sets a cell', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_context');
        const ctx = createMockRequestContext('set-context-test');

        const result = await tool.cb({ cell: 'C5' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.cell, 'C5');
        assert.ok((result.structuredContent.changed as string[]).includes('cell'));
    });
});

test('set_context errors on a non-existent sheet', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_context');
        const ctx = createMockRequestContext('set-context-test');

        const result = await tool.cb({ sheet: 'DoesNotExist' }, ctx);

        assert.ok(
            result.content.some((c: any) => c.text && c.text.includes('not found')),
            `expected a "not found" error, got: ${JSON.stringify(result.content)}`
        );
    });
});

test('set_context errors when no workbook is open', async () => {
    await run(async () => {
        const emptyCtx = createTestContext('set-context-empty');
        const emptyServer = new MockMcpServer();

        const setContextHandler = new SetContextHandler();
        setContextHandler.server = emptyServer as any;
        setContextHandler.context = emptyCtx;
        await setContextHandler.register([]);

        const tool = emptyServer.getTool('set_context');
        const ctx = createMockRequestContext('set-context-empty');

        const result = await tool.cb({ sheet: 'Sheet1' }, ctx);

        assert.ok(
            result.content.some((c: any) => c.text && c.text.includes('not open')),
            `expected a "not open" error, got: ${JSON.stringify(result.content)}`
        );

        await (await emptyCtx).cleanup();
    });
});

export default async function () {
    await test.run();
}
