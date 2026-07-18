/**
 * Integration tests for Workbook flow tools.
 * Tests the complete workbook lifecycle: create, import, list, close, export.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { Context } from '../../src/filesystem/context.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Workbook Flow Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let workbookTools: WorkbookTools;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('workbook-flow-test');

        // Create WorkbookTools instance with mock server and test context
        workbookTools = new WorkbookTools();
        workbookTools.server = mockServer as any;
        workbookTools.context = testContext;
        workbookTools.expressApp = { get: () => {}, post: () => {} } as any;
        workbookTools.serverOptions = { serverHost: 'http://localhost:3000' };

        // Register all tools
        await workbookTools.register([]);
    });
});

test('teardown', async () => {
    await testContext.cleanup();
});

test('create_new_workbook creates workbook and sets as current', async () => {
    await run(async () => {
        const tool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('workbook-flow-test');

        const result = await tool.cb({ filename: 'test-workbook.xlsx' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.filename, 'test-workbook.xlsx');
        assert.equal(result.structuredContent.status, 'created');
        assert.ok(Array.isArray(result.structuredContent.sheets));
        assert.equal(result.structuredContent.sheets.length, 1); // Default sheet

        // Verify it's set as current file
        const currentFile = await testContext.getCurrentFile();
        assert.equal(currentFile, 'test-workbook.xlsx');
    });
});

test('create_new_workbook with custom filename', async () => {
    await run(async () => {
        const tool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('workbook-flow-test');

        const result = await tool.cb({ filename: 'custom-name.xlsx' }, ctx);

        assert.equal(result.structuredContent.filename, 'custom-name.xlsx');
        assert.equal(result.structuredContent.status, 'created');
    });
});

test('list_open_workbook returns all open workbooks', async () => {
    await run(async () => {
        const tool = mockServer.getTool('list_open_workbook');
        const ctx = createMockRequestContext('workbook-flow-test');

        // Create a couple of workbooks first
        const createTool = mockServer.getTool('create_new_workbook');
        await createTool.cb({ filename: 'workbook1.xlsx' }, ctx);
        await createTool.cb({ filename: 'workbook2.xlsx' }, ctx);

        const result = await tool.cb({}, ctx);

        assert.ok(result.structuredContent);
        assert.ok(Array.isArray(result.structuredContent.files));
        assert.ok(result.structuredContent.files.includes('workbook1.xlsx'));
        assert.ok(result.structuredContent.files.includes('workbook2.xlsx'));
    });
});

test('close_workbook removes workbook from session', async () => {
    await run(async () => {
        const tool = mockServer.getTool('close_workbook');
        const ctx = createMockRequestContext('workbook-flow-test');

        // Create a workbook to close
        const createTool = mockServer.getTool('create_new_workbook');
        await createTool.cb({ filename: 'to-close.xlsx' }, ctx);

        // Verify it exists
        let listTool = mockServer.getTool('list_open_workbook');
        let listResult = await listTool.cb({}, ctx);
        assert.ok(listResult.structuredContent.files.includes('to-close.xlsx'));

        // Close it
        const result = await tool.cb({ filename: 'to-close.xlsx' }, ctx);

        assert.equal(result.structuredContent.filename, 'to-close.xlsx');
        assert.equal(result.structuredContent.status, 'closed');

        // Verify it's gone
        listResult = await listTool.cb({}, ctx);
        assert.ok(!listResult.structuredContent.files.includes('to-close.xlsx'));
    });
});

test('close_workbook handles missing file gracefully', async () => {
    await run(async () => {
        const tool = mockServer.getTool('close_workbook');
        const ctx = createMockRequestContext('workbook-flow-test');

        const result = await tool.cb({ filename: 'nonexistent.xlsx' }, ctx);

        // Should not throw, should return error in content
        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes('not found') || c.text.includes('error')));
    });
});

test('export_workbook_to_url creates download URL with TTL', async () => {
    await run(async () => {
        const tool = mockServer.getTool('export_workbook_to_url');
        const ctx = createMockRequestContext('workbook-flow-test');

        // Create a workbook first
        const createTool = mockServer.getTool('create_new_workbook');
        await createTool.cb({ filename: 'to-export.xlsx' }, ctx);

        const result = await tool.cb({ filename: 'to-export.xlsx' }, ctx);

        assert.ok(result.structuredContent);
        assert.ok(result.structuredContent.downloadUrl);
        assert.ok(result.structuredContent.downloadUrl.includes('/download/to-export.xlsx/'));
        assert.ok(result.structuredContent.ttl);
        assert.equal(result.structuredContent.filename, 'to-export.xlsx');
    });
});

test('export_workbook_to_url with autoclose removes workbook', async () => {
    await run(async () => {
        const tool = mockServer.getTool('export_workbook_to_url');
        const ctx = createMockRequestContext('workbook-flow-test');

        // Create a workbook first
        const createTool = mockServer.getTool('create_new_workbook');
        await createTool.cb({ filename: 'autoclose-test.xlsx' }, ctx);

        const result = await tool.cb({ filename: 'autoclose-test.xlsx', autoclose: true }, ctx);

        assert.ok(result.structuredContent.downloadUrl);

        // Verify workbook is closed
        const listTool = mockServer.getTool('list_open_workbook');
        const listResult = await listTool.cb({}, ctx);
        assert.ok(!listResult.structuredContent.files.includes('autoclose-test.xlsx'));
    });
});

test('export_workbook_to_url without current file returns error', async () => {
    await run(async () => {
        const tool = mockServer.getTool('export_workbook_to_url');
        const ctx = createMockRequestContext('workbook-flow-test-different-user');

        // Don't create any workbook, don't set current file
        const result = await tool.cb({}, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes('no workbook is currently open')));
    });
});

test('import_workbook_from_url is registered', async () => {
    // Just verify the tool is registered
    assert.ok(mockServer.hasTool('import_workbook_from_url'));
});

export default test;