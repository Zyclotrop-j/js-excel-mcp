import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { HyperlinkHandler } from '../../src/tools/handleHyperlink.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { run } from '../../src/util/requestContext.js';

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let hyperlinkHandler: HyperlinkHandler;

export default function (test: any) {

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('hyperlink-test');

        hyperlinkHandler = new HyperlinkHandler();
        hyperlinkHandler.server = mockServer as any;
        hyperlinkHandler.context = testContext;
        await hyperlinkHandler.register([]);

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
        const ctx = createMockRequestContext('hyperlink-test');
        await createTool.cb({ filename: 'hyperlink-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ cell: 'A1', value: 'Google' }, ctx);
    });
});

test('set_cell_hyperlink sets a hyperlink with ref and url', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_hyperlink');
        const ctx = createMockRequestContext('hyperlink-test');

        const result = await tool.cb({ ref: 'A1', url: 'https://example.com' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.url, 'https://example.com');
    });
});

test('set_cell_hyperlink sets a hyperlink with display and tooltip', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_hyperlink');
        const ctx = createMockRequestContext('hyperlink-test');

        const result = await tool.cb({
            ref: 'A1',
            url: 'https://example.com/page',
            display: 'Example Site',
            tooltip: 'Visit example'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.url, 'https://example.com/page');
        assert.equal(result.structuredContent.display, 'Example Site');
    });
});

test('set_cell_hyperlink resolves cell via row and col', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_hyperlink');
        const ctx = createMockRequestContext('hyperlink-test');

        const result = await tool.cb({ row: 1, col: 1, url: 'https://rowcol.example.com' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.url, 'https://rowcol.example.com');
    });
});

test('set_cell_hyperlink errors when no workbook is open', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_hyperlink');
        const ctx = createMockRequestContext('hyperlink-no-workbook');

        const result = await tool.cb({ ref: 'A1', url: 'https://example.com' }, ctx);

        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));
    });
});

test('set_cell_hyperlink errors when url is missing', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_hyperlink');
        const ctx = createMockRequestContext('hyperlink-test');

        let threw = false;
        try {
            await tool.cb({ ref: 'A1' }, ctx);
        } catch (err) {
            threw = true;
        }

        assert.ok(threw, 'expected missing url to cause a validation error');
    });
});

test.after(async () => {
    await (await testContext).cleanup();
});

}