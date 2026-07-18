import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { ProtectionHandler } from '../../src/tools/handleProtection.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Protection Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let protectionHandler: ProtectionHandler;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('protection-test');

        protectionHandler = new ProtectionHandler();
        protectionHandler.server = mockServer as any;
        protectionHandler.context = testContext;
        await protectionHandler.register([]);

        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('protection-test');
        await createTool.cb({ filename: 'protection-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ cell: 'A1', value: 'Test' }, ctx);
    });
});

test('protect_sheet enables protection', async () => {
    await run(async () => {
        const tool = mockServer.getTool('protect_sheet');
        const ctx = createMockRequestContext('protection-test');

        const result = await tool.cb({ enable: true }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.protected, true);
    });
});

test('protect_sheet disables protection', async () => {
    await run(async () => {
        const tool = mockServer.getTool('protect_sheet');
        const ctx = createMockRequestContext('protection-test');

        const result = await tool.cb({ enable: false }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.protected, false);
    });
});

test('lock_cell locks a cell by ref', async () => {
    await run(async () => {
        const tool = mockServer.getTool('lock_cell');
        const ctx = createMockRequestContext('protection-test');

        const result = await tool.cb({ ref: 'A1', locked: true }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.locked, true);
    });
});

test('lock_cell unlocks a cell by ref', async () => {
    await run(async () => {
        const tool = mockServer.getTool('lock_cell');
        const ctx = createMockRequestContext('protection-test');

        const result = await tool.cb({ ref: 'A1', locked: false }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.locked, false);
    });
});

test('lock_cell locks cell by row/col coordinates', async () => {
    await run(async () => {
        const tool = mockServer.getTool('lock_cell');
        const ctx = createMockRequestContext('protection-test');

        const result = await tool.cb({ row: 1, col: 2, locked: true }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'B1');
        assert.equal(result.structuredContent.locked, true);
    });
});

test('lock_cell error when sheet not found', async () => {
    await run(async () => {
        const tool = mockServer.getTool('lock_cell');
        const ctx = createMockRequestContext('protection-test');

        const result = await tool.cb({ ref: 'C1', locked: true, sheet: 'NonExistentSheet' }, ctx);

        assert.ok(result.content);
        assert.ok(result.content && result.content.some((c: any) => c.text && c.text.includes(`sheet 'NonExistentSheet' not found`)));
    });
});

test('protect_sheet error when no workbook is open', async () => {
    await run(async () => {
        const tool = mockServer.getTool('protect_sheet');
        const ctx = createMockRequestContext('protection-test');

        const result = await tool.cb({ enable: true, workbook: 'nonexistent.xlsx' }, ctx);

        assert.ok(result.content);
        assert.ok(result.content && result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});

export default async function () {
    await test.run();
}