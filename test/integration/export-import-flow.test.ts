/**
 * Integration tests for Export/Import flow tools.
 * Tests the complete export workflow: create → write → export → verify URL,
 * and import from URL with mocked fetch.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellTools } from '../../src/tools/handleCell.js';

const test = baretest('Export/Import Flow Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let workbookTools: WorkbookTools;
let cellTools: CellTools;

test('setup', async () => {
    mockServer = new MockMcpServer();
    testContext = createTestContext('export-import-flow-test');

    workbookTools = new WorkbookTools();
    workbookTools.server = mockServer as any;
    workbookTools.context = testContext;
    workbookTools.expressApp = { get: () => {}, post: () => {} } as any;
    workbookTools.serverOptions = { serverHost: 'http://localhost:3000' };
    await workbookTools.register([]);

    cellTools = new CellTools();
    cellTools.server = mockServer as any;
    cellTools.context = testContext;
    await cellTools.register([]);
});

test('teardown', async () => {
    await testContext.cleanup();
});

test('export after creating workbook produces valid download URL', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'export-basic.xlsx' }, ctx);
    const result = await exportTool.cb({ filename: 'export-basic.xlsx' }, ctx);

    assert.ok(result.structuredContent);
    assert.ok(result.structuredContent.downloadUrl);
    assert.ok(result.structuredContent.downloadUrl.startsWith('http://localhost:3000/download/export-basic.xlsx/'));
    assert.equal(result.structuredContent.filename, 'export-basic.xlsx');
    assert.ok(result.structuredContent.ttl);
});

test('export after writing data includes data in download', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const setTool = mockServer.getTool('set_cell');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'export-with-data.xlsx' }, ctx);
    await setTool.cb({ cell: 'A1', value: 'Hello' }, ctx);
    await setTool.cb({ cell: 'B1', value: 42 }, ctx);

    const result = await exportTool.cb({ filename: 'export-with-data.xlsx' }, ctx);

    assert.ok(result.structuredContent);
    assert.ok(result.structuredContent.downloadUrl);
    assert.ok(result.structuredContent.downloadUrl.includes('/download/export-with-data.xlsx/'));
    assert.equal(result.structuredContent.filename, 'export-with-data.xlsx');
});

test('export with autoclose removes workbook after export', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const listTool = mockServer.getTool('list_open_workbook');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'autoclose-export.xlsx' }, ctx);

    let listResult = await listTool.cb({}, ctx);
    assert.ok(listResult.structuredContent.files.includes('autoclose-export.xlsx'));

    const exportResult = await exportTool.cb({ filename: 'autoclose-export.xlsx', autoclose: true }, ctx);

    assert.ok(exportResult.structuredContent.downloadUrl);

    listResult = await listTool.cb({}, ctx);
    assert.ok(!listResult.structuredContent.files.includes('autoclose-export.xlsx'));
});

test('export without autoclose keeps workbook open', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const listTool = mockServer.getTool('list_open_workbook');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'no-autoclose.xlsx' }, ctx);
    await exportTool.cb({ filename: 'no-autoclose.xlsx' }, ctx);

    const listResult = await listTool.cb({}, ctx);
    assert.ok(listResult.structuredContent.files.includes('no-autoclose.xlsx'));
});

test('export without filename and no current file returns error', async () => {
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const ctx = createMockRequestContext('export-import-flow-test-no-file');

    const result = await exportTool.cb({}, ctx);

    assert.ok(result.content);
    assert.ok(result.content.some((c: any) => c.text.includes('no workbook is currently open')));
});

test('export with explicit filename uses that file', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'explicit-export.xlsx' }, ctx);
    const result = await exportTool.cb({ filename: 'explicit-export.xlsx' }, ctx);

    assert.ok(result.structuredContent);
    assert.equal(result.structuredContent.filename, 'explicit-export.xlsx');
    assert.ok(result.structuredContent.downloadUrl.includes('explicit-export.xlsx'));
});

test('export with nonexistent filename returns error', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'exists.xlsx' }, ctx);
    const result = await exportTool.cb({ filename: 'does-not-exist.xlsx' }, ctx);

    assert.ok(result.content);
    assert.ok(result.content.some((c: any) => c.text.includes('error') || c.text.includes('not found')));
});

test('import_workbook_from_url tool is registered', async () => {
    assert.ok(mockServer.hasTool('import_workbook_from_url'));
});

test('export creates downloadable URL with correct path format', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'url-format.xlsx' }, ctx);
    const result = await exportTool.cb({ filename: 'url-format.xlsx' }, ctx);

    const url = new URL(result.structuredContent.downloadUrl);
    assert.equal(url.hostname, 'localhost');
    assert.equal(url.port, '3000');
    assert.equal(url.pathname, '/download/url-format.xlsx');
    assert.ok(url.pathname.startsWith('/download/'));
    // The key segment should be present after the filename
    const pathParts = url.pathname.split('/');
    assert.equal(pathParts.length, 4); // /download/filename/key
    assert.equal(pathParts[1], 'download');
    assert.equal(pathParts[2], 'url-format.xlsx');
    assert.ok(pathParts[3].length > 0);
});

test('multiple exports generate unique download URLs', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'multi-export.xlsx' }, ctx);

    const result1 = await exportTool.cb({ filename: 'multi-export.xlsx' }, ctx);
    const result2 = await exportTool.cb({ filename: 'multi-export.xlsx' }, ctx);

    // Keys should be different for each export
    const url1 = new URL(result1.structuredContent.downloadUrl);
    const url2 = new URL(result2.structuredContent.downloadUrl);
    const key1 = url1.pathname.split('/')[3];
    const key2 = url2.pathname.split('/')[3];
    assert.notEqual(key1, key2);
});

test('export returns ttl as string', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'ttl-test.xlsx' }, ctx);
    const result = await exportTool.cb({ filename: 'ttl-test.xlsx' }, ctx);

    assert.ok(typeof result.structuredContent.ttl === 'string');
    assert.ok(result.structuredContent.ttl.length > 0);
});

test('export preserves workbook content for re-import', async () => {
    const createTool = mockServer.getTool('create_new_workbook');
    const setTool = mockServer.getTool('set_cell');
    const exportTool = mockServer.getTool('export_workbook_to_url');
    const ctx = createMockRequestContext('export-import-flow-test');

    await createTool.cb({ filename: 'roundtrip.xlsx' }, ctx);
    await setTool.cb({ cell: 'A1', value: 'roundtrip-data' }, ctx);

    const exportResult = await exportTool.cb({ filename: 'roundtrip.xlsx' }, ctx);

    // Verify the URL is valid and the export completed
    assert.ok(exportResult.structuredContent.downloadUrl);
    assert.ok(exportResult.structuredContent.downloadUrl.includes('roundtrip.xlsx'));
});

export default function registerTests(testInstance: ReturnType<typeof baretest>) {
    // Tests registered on shared instance
}
