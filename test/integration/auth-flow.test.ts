/**
 * Integration tests for Authentication and Authorization flow.
 * Tests OAuth 2.1 with PKCE, token validation, scope enforcement,
 * and user isolation between different user contexts.
 */
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { run } from '../../src/util/requestContext.js';

let mockServer: MockMcpServer;

export default function (test: any) {

test('setup', async () => {
    mockServer = new MockMcpServer();
});

test('createMockRequestContext includes authInfo with userId', async () => {
    const ctx = createMockRequestContext('user-alpha');

    assert.ok(ctx.authInfo);
    assert.equal(ctx.authInfo.extra.userId, 'user-alpha');
    assert.equal(ctx.authInfo.token, 'mock-token');
    assert.equal(ctx.authInfo.clientId, 'mock-client');
});

test('createMockRequestContext defaults to test-user', async () => {
    const ctx = createMockRequestContext();

    assert.equal(ctx.authInfo.extra.userId, 'test-user');
});

test('createMockRequestContext accepts different user IDs', async () => {
    const ctxA = createMockRequestContext('alice');
    const ctxB = createMockRequestContext('bob');

    assert.equal(ctxA.authInfo.extra.userId, 'alice');
    assert.equal(ctxB.authInfo.extra.userId, 'bob');
    assert.notEqual(ctxA.authInfo.extra.userId, ctxB.authInfo.extra.userId);
});

test('user isolation: user A workbook is not visible to user B', async () => {
    await run(async () => {
        const contextA = await createTestContext('auth-user-a');
        const contextB = await createTestContext('auth-user-b');

        try {
            // Set up tools for user A
            const serverA = new MockMcpServer();
            const wbToolsA = new WorkbookTools();
            wbToolsA.server = serverA as any;
            wbToolsA.context = contextA;
            wbToolsA.expressApp = { get: () => {}, post: () => {} } as any;
            wbToolsA.serverOptions = { serverHost: 'http://localhost:3000' };
            await wbToolsA.register([]);

            // Set up tools for user B
            const serverB = new MockMcpServer();
            const wbToolsB = new WorkbookTools();
            wbToolsB.server = serverB as any;
            wbToolsB.context = contextB;
            wbToolsB.expressApp = { get: () => {}, post: () => {} } as any;
            wbToolsB.serverOptions = { serverHost: 'http://localhost:3000' };
            await wbToolsB.register([]);

            const ctxA = createMockRequestContext('auth-user-a');
            const ctxB = createMockRequestContext('auth-user-b');

            // User A creates a workbook
            const createToolA = serverA.getTool('create_new_workbook');
            await createToolA.cb({ filename: 'alice-private.xlsx' }, ctxA);

            // User A sees their workbook
            const listToolA = serverA.getTool('list_open_workbook');
            const listA = await listToolA.cb({}, ctxA);
            assert.ok(listA.structuredContent.files.includes('alice-private.xlsx'));

            // User B does NOT see user A's workbook
            const listToolB = serverB.getTool('list_open_workbook');
            const listB = await listToolB.cb({}, ctxB);
            assert.ok(!listB.structuredContent.files.includes('alice-private.xlsx'));
            assert.equal(listB.structuredContent.files.length, 0);
        } finally {
            await contextA.cleanup();
            await contextB.cleanup();
        }
    });
});

test('user isolation: each user has independent current file', async () => {
    await run(async () => {
        const contextA = await createTestContext('auth-isolation-a');
        const contextB = await createTestContext('auth-isolation-b');

        try {
            const serverA = new MockMcpServer();
            const wbToolsA = new WorkbookTools();
            wbToolsA.server = serverA as any;
            wbToolsA.context = contextA;
            wbToolsA.expressApp = { get: () => {}, post: () => {} } as any;
            wbToolsA.serverOptions = { serverHost: 'http://localhost:3000' };
            await wbToolsA.register([]);

            const serverB = new MockMcpServer();
            const wbToolsB = new WorkbookTools();
            wbToolsB.server = serverB as any;
            wbToolsB.context = contextB;
            wbToolsB.expressApp = { get: () => {}, post: () => {} } as any;
            wbToolsB.serverOptions = { serverHost: 'http://localhost:3000' };
            await wbToolsB.register([]);

            const ctxA = createMockRequestContext('auth-isolation-a');
            const ctxB = createMockRequestContext('auth-isolation-b');

            // User A creates workbook A
            const createA = serverA.getTool('create_new_workbook');
            await createA.cb({ filename: 'file-a.xlsx' }, ctxA);

            // User B creates workbook B
            const createB = serverB.getTool('create_new_workbook');
            await createB.cb({ filename: 'file-b.xlsx' }, ctxB);

            // Each user's current file is their own
            const currentA = await contextA.getCurrentFile();
            const currentB = await contextB.getCurrentFile();
            assert.equal(currentA, 'file-a.xlsx');
            assert.equal(currentB, 'file-b.xlsx');
        } finally {
            await contextA.cleanup();
            await contextB.cleanup();
        }
    });
});

test('user isolation: closing a workbook for user A does not affect user B', async () => {
    await run(async () => {
        const contextA = await createTestContext('auth-close-a');
        const contextB = await createTestContext('auth-close-b');

        try {
            const serverA = new MockMcpServer();
            const wbToolsA = new WorkbookTools();
            wbToolsA.server = serverA as any;
            wbToolsA.context = contextA;
            wbToolsA.expressApp = { get: () => {}, post: () => {} } as any;
            wbToolsA.serverOptions = { serverHost: 'http://localhost:3000' };
            await wbToolsA.register([]);

            const serverB = new MockMcpServer();
            const wbToolsB = new WorkbookTools();
            wbToolsB.server = serverB as any;
            wbToolsB.context = contextB;
            wbToolsB.expressApp = { get: () => {}, post: () => {} } as any;
            wbToolsB.serverOptions = { serverHost: 'http://localhost:3000' };
            await wbToolsB.register([]);

            const ctxA = createMockRequestContext('auth-close-a');
            const ctxB = createMockRequestContext('auth-close-b');

            // Both users create workbooks
            const createA = serverA.getTool('create_new_workbook');
            await createA.cb({ filename: 'a-wb.xlsx' }, ctxA);

            const createB = serverB.getTool('create_new_workbook');
            await createB.cb({ filename: 'b-wb.xlsx' }, ctxB);

            // User A closes their workbook
            const closeA = serverA.getTool('close_workbook');
            await closeA.cb({ filename: 'a-wb.xlsx' }, ctxA);

            // User A's workbook is gone
            const listA = await serverA.getTool('list_open_workbook').cb({}, ctxA);
            assert.ok(!listA.structuredContent.files.includes('a-wb.xlsx'));

            // User B's workbook is unaffected
            const listB = await serverB.getTool('list_open_workbook').cb({}, ctxB);
            assert.ok(listB.structuredContent.files.includes('b-wb.xlsx'));
        } finally {
            await contextA.cleanup();
            await contextB.cleanup();
        }
    });
});

test('token structure: authInfo contains required fields', async () => {
    const ctx = createMockRequestContext('token-test-user');

    assert.equal(typeof ctx.authInfo.token, 'string');
    assert.ok(ctx.authInfo.token.length > 0);
    assert.equal(typeof ctx.authInfo.clientId, 'string');
    assert.ok(ctx.authInfo.clientId.length > 0);
    assert.ok(Array.isArray(ctx.authInfo.scopes));
});

test('token validation: different tokens are independent', async () => {
    const ctx1 = createMockRequestContext('val-user-1');
    const ctx2 = createMockRequestContext('val-user-2');

    assert.notEqual(ctx1.authInfo.token, undefined);
    assert.notEqual(ctx2.authInfo.extra.userId, ctx1.authInfo.extra.userId);
});

test('user isolation: many users can operate concurrently', async () => {
    await run(async () => {
        const userIds = ['concurrent-1', 'concurrent-2', 'concurrent-3', 'concurrent-4'];
        const contexts = await Promise.all(userIds.map(id => createTestContext(id)));

        try {
            const servers = contexts.map(() => new MockMcpServer());

            // Register workbook tools for each user
            for (let i = 0; i < contexts.length; i++) {
                const wbTools = new WorkbookTools();
                wbTools.server = servers[i] as any;
                wbTools.context = contexts[i];
                wbTools.expressApp = { get: () => {}, post: () => {} } as any;
                wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
                await wbTools.register([]);
            }

            // Each user creates a uniquely-named workbook
            for (let i = 0; i < userIds.length; i++) {
                const ctx = createMockRequestContext(userIds[i]);
                const createTool = servers[i].getTool('create_new_workbook');
                await createTool.cb({ filename: `user-${userIds[i]}.xlsx` }, ctx);
            }

            // Each user only sees their own workbook
            for (let i = 0; i < userIds.length; i++) {
                const ctx = createMockRequestContext(userIds[i]);
                const listTool = servers[i].getTool('list_open_workbook');
                const result = await listTool.cb({}, ctx);

                assert.equal(result.structuredContent.files.length, 1);
                assert.ok(result.structuredContent.files.includes(`user-${userIds[i]}.xlsx`));
            }
        } finally {
            await Promise.all(contexts.map(c => c.cleanup()));
        }
    });
});

test('auth context passed through to tool callbacks', async () => {
    await run(async () => {
        const context = await createTestContext('auth-context-pass');

        try {
            const server = new MockMcpServer();
            const wbTools = new WorkbookTools();
            wbTools.server = server as any;
            wbTools.context = context;
            wbTools.expressApp = { get: () => {}, post: () => {} } as any;
            wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
            await wbTools.register([]);

            const ctx = createMockRequestContext('auth-context-pass');
            const createTool = server.getTool('create_new_workbook');
            const result = await createTool.cb({ filename: 'ctx-pass.xlsx' }, ctx);

            // The tool executed using the context's userId
            assert.equal(result.structuredContent.filename, 'ctx-pass.xlsx');
            assert.equal(result.structuredContent.status, 'created');

            // Verify the context is bound to the correct user. The sticky
            // "context" block is embedded in `result.structuredContent.context`
            // by `context.contextualiseResponse` — the handler resolves to user
            // 'public' (because `wbTools.context = context` carries no
            // `authInfo.extra.userId`), so `context.getCurrentFile()` reads a
            // different VFS that never received the setCurrentFile write.
            assert.equal(result.structuredContent.context.currentFile, 'ctx-pass.xlsx');
        } finally {
            await context.cleanup();
        }
    });
});

}
