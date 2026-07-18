/**
 * BUG-4: close_workbook with no args crashes instead of graceful error.
 *
 * The input schema requires `filename: z.string()` (not optional).
 * Calling close_workbook without args triggers a Zod validation error
 * instead of checking the sticky context for a current file or returning
 * a graceful "no workbook open" message.
 */
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { run } from '../../src/util/requestContext.js';
import z from 'zod';

async function setupBug4() {
    const mockServer = new MockMcpServer();
    const testContext = createTestContext('bug4-close-test');

    await run(async () => {
        const wbTools = new WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);
    });

    return { mockServer, testContext };
}

export default function (test: any) {

test('BUG-4: close_workbook with no args uses sticky context currentFile', async () => {
    const { mockServer, testContext } = await setupBug4();
    try {
        await run(async () => {
            const ctx = createMockRequestContext('bug4-close-test');

            await mockServer.getTool('create_new_workbook').cb({ filename: 'sticky-close.xlsx' }, ctx);

            const tool = mockServer.getTool('close_workbook');
            const schema = tool.inputSchema as z.ZodType<any>;

            const parseResult = schema.safeParse({});
            assert.equal(parseResult.success, true, 'Empty args should pass schema validation (filename is optional)');

            const result = await tool.cb({}, ctx);

            assert.ok(result.structuredContent);
            assert.equal(result.structuredContent.filename, 'sticky-close.xlsx');
            assert.equal(result.structuredContent.status, 'closed');
        });
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-4: schema rejects undefined args', async () => {
    const { mockServer, testContext } = await setupBug4();
    try {
        const tool = mockServer.getTool('close_workbook');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse(undefined);
        assert.equal(result.success, false, 'Undefined args should fail schema validation');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-4: schema rejects null args', async () => {
    const { mockServer, testContext } = await setupBug4();
    try {
        const tool = mockServer.getTool('close_workbook');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse(null);
        assert.equal(result.success, false, 'Null args should fail schema validation');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-4: close_workbook with valid filename succeeds', async () => {
    const { mockServer, testContext } = await setupBug4();
    try {
        await run(async () => {
            const ctx = createMockRequestContext('bug4-close-test');

            await mockServer.getTool('create_new_workbook').cb({ filename: 'to-close.xlsx' }, ctx);

            const result = await mockServer.getTool('close_workbook').cb({ filename: 'to-close.xlsx' }, ctx);

            assert.ok(result.structuredContent);
            assert.equal(result.structuredContent.filename, 'to-close.xlsx');
            assert.equal(result.structuredContent.status, 'closed');
        });
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-4: close_workbook with nonexistent filename returns error gracefully', async () => {
    const { mockServer, testContext } = await setupBug4();
    try {
        await run(async () => {
            const ctx = createMockRequestContext('bug4-close-test');

            const result = await mockServer.getTool('close_workbook').cb({ filename: 'nonexistent.xlsx' }, ctx);

            assert.ok(result.content);
            assert.ok(result.content.some((c: any) => c.text.includes('not found') || c.text.includes('error')));
        });
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-4: no-args close_workbook succeeds via sticky context then list still works', async () => {
    const { mockServer, testContext } = await setupBug4();
    try {
        await run(async () => {
            const ctx = createMockRequestContext('bug4-close-test');

            await mockServer.getTool('create_new_workbook').cb({ filename: 'survivor.xlsx' }, ctx);

            const closeResult = await mockServer.getTool('close_workbook').cb({}, ctx);
            assert.ok(closeResult.structuredContent);
            assert.equal(closeResult.structuredContent.status, 'closed');

            const listResult = await mockServer.getTool('list_open_workbook').cb({}, ctx);
            assert.ok(!listResult.structuredContent.files.includes('survivor.xlsx'));
        });
    } finally {
        await (await testContext).cleanup();
    }
});

}
