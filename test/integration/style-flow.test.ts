import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { StyleHandler } from '../../src/tools/handleStyle.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Style Flow Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let styleHandler: StyleHandler;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('style-flow-test');

        styleHandler = new StyleHandler();
        styleHandler.server = mockServer as any;
        styleHandler.context = testContext;
        await styleHandler.register([]);

        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('style-flow-test');
        await createTool.cb({ filename: 'style-test.xlsx' }, ctx);

        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ cell: 'A1', value: 'Styled' }, ctx);
        await setCell.cb({ cell: 'B1', value: 'Bold' }, ctx);
        await setCell.cb({ cell: 'C1', value: 'Aligned' }, ctx);
    });
});

test('teardown', async () => {
    const ctx = await testContext;
    await ctx.cleanup();
});

test('set_cell_bold toggles bold on a cell', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_bold');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({ ref: 'B1', bold: true }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'B1');
        assert.equal(result.structuredContent.bold, true);
    });
});

test('set_cell_bold removes bold', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_bold');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({ ref: 'B1', bold: false }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'B1');
        assert.equal(result.structuredContent.bold, false);
    });
});

test('set_cell_font sets fontSize, fontName, and fontColor', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_font');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({
            ref: 'A1',
            fontSize: 14,
            fontName: 'Arial',
            fontColor: 'FFFF0000'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.fontSize, 14);
        assert.equal(result.structuredContent.fontName, 'Arial');
        assert.equal(result.structuredContent.fontColor, 'FFFF0000');
    });
});

test('set_cell_font sets fontSize only', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_font');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({ ref: 'A1', fontSize: 18 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.fontSize, 18);
    });
});

test('set_cell_background_color sets cell fill color', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_background_color');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({ ref: 'A1', color: 'FFFFFF00' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.color, 'FFFFFF00');
    });
});

test('set_cell_alignment sets horizontal and vertical alignment', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_alignment');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({
            ref: 'C1',
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'C1');
        assert.equal(result.structuredContent.horizontal, 'center');
        assert.equal(result.structuredContent.vertical, 'middle');
        assert.equal(result.structuredContent.wrapText, true);
    });
});

test('set_cell_alignment sets horizontal only', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_alignment');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({ ref: 'C1', horizontal: 'right' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'C1');
        assert.equal(result.structuredContent.horizontal, 'right');
    });
});

test('set_cell_border sets thin border on all sides', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_border');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({ ref: 'A1', borderStyle: 'thin', sides: 'all' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.borderStyle, 'thin');
        assert.equal(result.structuredContent.sides, 'all');
    });
});

test('set_cell_border sets thick border on top side only', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_border');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({ ref: 'B1', borderStyle: 'thick', sides: 'top' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'B1');
        assert.equal(result.structuredContent.borderStyle, 'thick');
        assert.equal(result.structuredContent.sides, 'top');
    });
});

test('set_cell_border removes border with none', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_cell_border');
        const ctx = createMockRequestContext('style-flow-test');

        const result = await tool.cb({ ref: 'A1', borderStyle: 'none', sides: 'all' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.ref, 'A1');
        assert.equal(result.structuredContent.borderStyle, 'none');
        assert.equal(result.structuredContent.sides, 'all');
    });
});

export default function registerTests(testInstance: ReturnType<typeof baretest>) {
}
