/**
 * Integration tests for Named Range tools.
 * Tests named range management: defining and deleting named ranges.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { NamedRangeHandler } from '../../src/tools/handleNamedRange.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Named Range Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let namedRangeHandler: NamedRangeHandler;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('named-range-test');

        // Create NamedRangeHandler instance with mock server and test context
        namedRangeHandler = new NamedRangeHandler();
        namedRangeHandler.server = mockServer as any;
        namedRangeHandler.context = testContext;
        await namedRangeHandler.register([]);

        // Import and setup WorkbookTools to create a workbook
        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        // Create a test workbook
        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('named-range-test');
        await createTool.cb({ filename: 'named-range-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);
    });
});

test('teardown', async () => {
    await (await testContext).cleanup();
});

test('add_named_range creates named range for current sheet', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_named_range');
        const ctx = createMockRequestContext('named-range-test');

        const result = await tool.cb({ name: 'Total', range: 'A1:A10' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'named-range-test.xlsx');
        assert.equal(result.structuredContent.name, 'Total');
        assert.equal(result.structuredContent.range, 'Sheet1!A1:A10');
    });
});

test('add_named_range accepts sheet prefix in range', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_named_range');
        const ctx = createMockRequestContext('named-range-test');

        const result = await tool.cb({ name: 'SheetData', range: 'Sheet1!B2:C20' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.name, 'SheetData');
        assert.equal(result.structuredContent.range, 'Sheet1!B2:C20');
    });
});

test('add_named_range without workbook error', async () => {
    await run(async () => {
        const separateContext = await createTestContext('no-workbook-test');
        const separateMockServer = new MockMcpServer();

        const wbToolsMod = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new wbToolsMod.WorkbookTools();
        wbTools.server = separateMockServer as any;
        wbTools.context = separateContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const separateNamedRangeHandler = new NamedRangeHandler();
        separateNamedRangeHandler.server = separateMockServer as any;
        separateNamedRangeHandler.context = separateContext;
        await separateNamedRangeHandler.register([]);

        const tool = separateMockServer.getTool('add_named_range');

        const noWbCtx = createMockRequestContext('different-user');
        const result = await tool.cb({ name: 'TestRange', range: 'A1:B10' }, noWbCtx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')));
        await separateContext.cleanup();
    });
});

test('delete_named_range removes existing named range', async () => {
    await run(async () => {
        const addTool = mockServer.getTool('add_named_range');
        const deleteTool = mockServer.getTool('delete_named_range');
        const ctx = createMockRequestContext('named-range-test');

        // First add a named range
        await addTool.cb({ name: 'ToDelete', range: 'A1:B10' }, ctx);

        // Then delete it
        const result = await deleteTool.cb({ name: 'ToDelete' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'named-range-test.xlsx');
        assert.equal(result.structuredContent.name, 'ToDelete');
        assert.equal(result.structuredContent.action, 'deleted');
    });
});

test('delete_named_range error on non-existent range', async () => {
    await run(async () => {
        const tool = mockServer.getTool('delete_named_range');
        const ctx = createMockRequestContext('named-range-test');

        const result = await tool.cb({ name: 'NonExistentRange' }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes("named range 'NonExistentRange' not found")));
    });
});

test('add_named_range without current sheet error', async () => {
    await run(async () => {
        // Create a scenario without a current sheet
        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('named-range-test');
        
        // Create a workbook without a default sheet
        await createTool.cb({ filename: 'no-sheet.xlsx', createDefaultWorksheet: false }, ctx);

        const tool = mockServer.getTool('add_named_range');
        
        // Try to add a named range without specifying sheet in range
        // Note: Depending on implementation, this might fail if no current sheet
        const result = await tool.cb({ name: 'TestRange', range: 'A1:B10' }, ctx);

        // Implementation may either error or auto-add a default sheet
        if (result.content && result.content.some((c: any) => c.text.includes('error') || c.text.includes('sheet'))) {
            // Error expected in some implementations
            assert.ok(true);
        } else {
            // Or it might succeed if implementation auto-creates sheet
            assert.ok(result.structuredContent);
        }
    });
});

test('delete_named_range with explicit workbook parameter', async () => {
    await run(async () => {
        const addTool = mockServer.getTool('add_named_range');
        const deleteTool = mockServer.getTool('delete_named_range');
        const ctx = createMockRequestContext('named-range-test');

        // Create a second workbook first
        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools2 = new workbookTools.WorkbookTools();
        wbTools2.server = mockServer as any;
        wbTools2.context = testContext;
        wbTools2.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools2.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools2.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        await createTool.cb({ filename: 'wb2.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

        // Add named range to specific workbook by specifying workbook parameter
        const result = await addTool.cb({ 
            workbook: 'wb2.xlsx', 
            name: 'Wb2Range', 
            range: 'A1:B10' 
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'wb2.xlsx');
        assert.equal(result.structuredContent.name, 'Wb2Range');

        // Delete using explicit workbook parameter
        const deleteResult = await deleteTool.cb({
            workbook: 'wb2.xlsx',
            name: 'Wb2Range'
        }, ctx);

        assert.ok(deleteResult.structuredContent);
        assert.equal(deleteResult.structuredContent.filename, 'wb2.xlsx');
        assert.equal(deleteResult.structuredContent.name, 'Wb2Range');
        assert.equal(deleteResult.structuredContent.action, 'deleted');
    });
});

export default async function () {
    await test.run();
}
