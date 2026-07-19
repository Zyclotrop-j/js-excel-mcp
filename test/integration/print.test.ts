import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { PrintHandler } from '../../src/tools/handlePrint.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { run } from '../../src/util/requestContext.js';

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let printHandler: PrintHandler;

export default function (test: any) {

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('print-test');
        await testContext;

        printHandler = new PrintHandler();
        printHandler.server = mockServer as any;
        printHandler.context = testContext;
        await printHandler.register([]);

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
        const ctx = createMockRequestContext('print-test');
        await createTool.cb({ filename: 'print-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        const setCell = mockServer.getTool('set_cell');
        await setCell.cb({ cell: 'A1', value: 'Header1' }, ctx);
        await setCell.cb({ cell: 'B1', value: 'Header2' }, ctx);
        await setCell.cb({ cell: 'C1', value: 'Data1' }, ctx);
        await setCell.cb({ cell: 'C2', value: 'Data2' }, ctx);
    });
});

test.after(async () => {
    if (!testContext) return;
    await (await testContext).cleanup();
});

test('set_print_area sets print area correctly', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_print_area');
        const ctx = createMockRequestContext('print-test');

        const result = await tool.cb({ range: 'A1:C2' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'print-test.xlsx');
        assert.equal(result.structuredContent.sheet, 'Sheet1');
        assert.equal(result.structuredContent.range, 'A1:C2');
        assert.equal(result.structuredContent.action, 'set');
    });
});

test('set_print_area without open workbook returns error', async () => {
    await run(async () => {
        // Use a separate context with no workbook to test the error path.
        const noWbContext = await createTestContext('print-test-no-wb');
        const noWbServer = new MockMcpServer();

        const printHandlerNoWb = new PrintHandler();
        printHandlerNoWb.server = noWbServer as any;
        printHandlerNoWb.context = noWbContext;
        await printHandlerNoWb.register([]);

        const tool = noWbServer.getTool('set_print_area');
        const ctx = createMockRequestContext('print-test-no-wb');

        const result = await tool.cb({ range: 'A1:C2' }, ctx);

        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));

        await noWbContext.cleanup();
    });
});

test('set_page_setup updates orientation and paper size', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_page_setup');
        const ctx = createMockRequestContext('print-test');

        const result = await tool.cb({ orientation: 'landscape', paperSize: 11 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'print-test.xlsx');
        assert.equal(result.structuredContent.sheet, 'Sheet1');
        assert.equal(result.structuredContent.orientation, 'landscape');
        assert.equal(result.structuredContent.paperSize, 11);
    });
});

test('set_page_setup with scale and fit dimensions', async () => {
    await run(async () => {
        const tool = mockServer.getTool('set_page_setup');
        const ctx = createMockRequestContext('print-test');

        const result = await tool.cb({ scale: 90, fitToWidth: 1, fitToHeight: 2 }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'print-test.xlsx');
        assert.equal(result.structuredContent.sheet, 'Sheet1');
        assert.equal(result.structuredContent.scale, 90);
    });
});

test('set_page_setup without open workbook returns error', async () => {
    await run(async () => {
        // Use a separate context with no workbook to test the error path.
        const noWbContext = await createTestContext('print-test-no-wb2');
        const noWbServer = new MockMcpServer();

        const printHandlerNoWb = new PrintHandler();
        printHandlerNoWb.server = noWbServer as any;
        printHandlerNoWb.context = noWbContext;
        await printHandlerNoWb.register([]);

        const tool = noWbServer.getTool('set_page_setup');
        const ctx = createMockRequestContext('print-test-no-wb2');

        const result = await tool.cb({ orientation: 'portrait' }, ctx);

        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));

        await noWbContext.cleanup();
    });
});

}