import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { CommentHandler } from '../../src/tools/handleComment.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Comment Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let commentHandler: CommentHandler;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('comment-test');

        commentHandler = new CommentHandler();
        commentHandler.server = mockServer as any;
        commentHandler.context = testContext;
        await commentHandler.register([]);

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
        const ctx = createMockRequestContext('comment-test');
        await createTool.cb({ filename: 'comment-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ cell: 'A1', value: 'Commented' }, ctx);
        await setCell.cb({ cell: 'B1', value: 'NoComment' }, ctx);
    });
});

test('add_comment adds a comment to a cell', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_comment');
        const ctx = createMockRequestContext('comment-test');

        const result = await tool.cb({ ref: 'A1', text: 'This is a note', author: 'Janne' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.author, 'Janne');
    });
});

test('add_comment uses default author when not provided', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_comment');
        const ctx = createMockRequestContext('comment-test');

        const result = await tool.cb({ ref: 'B1', text: 'Another note' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'B1');
        assert.equal(result.structuredContent.author, 'User');
    });
});

test('delete_comment removes an existing comment', async () => {
    await run(async () => {
        const addTool = mockServer.getTool('add_comment');
        const delTool = mockServer.getTool('delete_comment');
        const ctx = createMockRequestContext('comment-test');

        await addTool.cb({ ref: 'A1', text: 'To be deleted', author: 'Janne' }, ctx);
        const result = await delTool.cb({ ref: 'A1' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.ok(result.content.some((c: any) => c.text && c.text.includes('comment removed from cell A1')));
    });
});

test('delete_comment reports no comment when cell has none', async () => {
    await run(async () => {
        const tool = mockServer.getTool('delete_comment');
        const ctx = createMockRequestContext('comment-test');

        const result = await tool.cb({ ref: 'C1' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'C1');
        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no comment found on cell C1')));
    });
});

test('add_comment errors with no open workbook', async () => {
    await run(async () => {
        const freshContext = createTestContext('comment-no-wb');
        const isolatedHandler = new CommentHandler();
        isolatedHandler.server = mockServer as any;
        isolatedHandler.context = freshContext;
        await isolatedHandler.register([]);

        const tool = mockServer.getTool('add_comment');
        const ctx = createMockRequestContext('comment-no-wb');

        const result = await tool.cb({ ref: 'A1', text: 'orphan note' }, ctx);

        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));
        await (await freshContext).cleanup();
    });
});

test('delete_comment errors with no open workbook', async () => {
    await run(async () => {
        const freshContext = createTestContext('comment-no-wb2');
        const isolatedHandler = new CommentHandler();
        isolatedHandler.server = mockServer as any;
        isolatedHandler.context = freshContext;
        await isolatedHandler.register([]);

        const tool = mockServer.getTool('delete_comment');
        const ctx = createMockRequestContext('comment-no-wb2');

        const result = await tool.cb({ ref: 'A1' }, ctx);

        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));
        await (await freshContext).cleanup();
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});

export default async function () {
    await test.run();
}
