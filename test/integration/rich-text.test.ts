import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { RichTextHandler } from '../../src/tools/handleRichText.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Rich Text Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('rich-text-test');

        const richTextHandler = new RichTextHandler();
        richTextHandler.server = mockServer as any;
        richTextHandler.context = testContext;
        await richTextHandler.register([]);

        const cellWriteHandler = new CellWriteHandler();
        cellWriteHandler.server = mockServer as any;
        cellWriteHandler.context = testContext;
        await cellWriteHandler.register([]);

        const wbTools = new WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('rich-text-test');
        await createTool.cb({ filename: 'rich-text-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});

test('set_rich_text sets multiple runs with mixed formatting', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_rich_text');
        const ctx = createMockRequestContext('rich-text-test');

        const parts = [
            { text: 'Hello ', bold: true, fontSize: 14, fontColor: 'FFFF0000' },
            { text: 'World', italic: true, fontName: 'Arial' },
            { text: '!', underline: true }
        ];

        const result = await tool.cb({ ref: 'A1', parts }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.runCount, 3);
    });
});

test('set_rich_text accepts row/col instead of ref', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_rich_text');
        const ctx = createMockRequestContext('rich-text-test');

        const parts = [
            { text: 'by', bold: true },
            { text: 'coord' }
        ];

        const result = await tool.cb({ row: 2, col: 3, parts }, ctx);

        assert.ok(result.structuredContent);
        // col 3 = C, row 2 => C2
        assert.equal(result.structuredContent.ref, 'C2');
        assert.equal(result.structuredContent.runCount, 2);
    });
});

test('set_rich_text with a single plain run', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_rich_text');
        const ctx = createMockRequestContext('rich-text-test');

        const parts = [{ text: 'plain' }];

        const result = await tool.cb({ ref: 'A3', parts }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A3');
        assert.equal(result.structuredContent.runCount, 1);
    });
});

test('set_rich_text errors when no workbook is open', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_rich_text');
        // Use a separate userId context so no workbook is open for this request.
        const ctx = createMockRequestContext('rich-text-other-user');

        const result = await tool.cb({ ref: 'A1', parts: [{ text: 'x' }] }, ctx);

        assert.ok(result.content, 'expected content array');
        const found = result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open'));
        assert.ok(found, `expected 'no workbook is currently open' error, got: ${JSON.stringify(result.content)}`);
    });
});

export default async function () {
    await test.run();
}
