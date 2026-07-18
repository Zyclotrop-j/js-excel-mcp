/**
 * Integration tests for Sheet operations flow tools.
 * Tests sheet management: list, select, create, rename, delete, copy, move.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { SheetHandler } from '../../src/tools/handleSheet.js';
import { SheetOpsHandler } from '../../src/tools/handleSheetOps.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Sheet Operations Flow Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let sheetTools: SheetHandler;
let sheetOpsTools: SheetOpsHandler;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('sheet-ops-flow-test');

        // Create SheetTools instance
        sheetTools = new SheetHandler();
        sheetTools.server = mockServer as any;
        sheetTools.context = testContext;

        // Create SheetOpsTools instance
        sheetOpsTools = new SheetOpsHandler();
        sheetOpsTools.server = mockServer as any;
        sheetOpsTools.context = testContext;

        // Register all tools
        await sheetTools.register([]);
        await sheetOpsTools.register([]);

        // Create a test workbook
        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('sheet-ops-flow-test');
        await createTool.cb({ filename: 'sheet-test.xlsx' }, ctx);
    });
});

test('teardown', async () => {
    await testContext.cleanup();
});

test('list_sheets returns all sheet names', async () => {
    await run(async () => {
        const tool = mockServer.getTool('list_sheets');
        const ctx = createMockRequestContext('sheet-ops-flow-test');

        const result = await tool.cb({}, ctx);

        assert.ok(result.structuredContent);
        assert.ok(Array.isArray(result.structuredContent.sheets));
        assert.ok(result.structuredContent.sheets.length >= 1);
        assert.ok(result.structuredContent.sheets.includes('Sheet1'));
    });
});

test('select_sheet switches active sheet', async () => {
    await run(async () => {
        // First create a second sheet
        const createSheetTool = mockServer.getTool('create_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');
        await createSheetTool.cb({ name: 'Sheet2' }, ctx);

        // Now select it
        const selectTool = mockServer.getTool('select_sheet');
        const result = await selectTool.cb({ name: 'Sheet2' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.sheet, 'Sheet2');

        // Verify current sheet is updated
        const currentSheet = await testContext.getCurrentSheet();
        assert.equal(currentSheet, 'Sheet2');
    });
});

test('select_sheet validates sheet exists', async () => {
    await run(async () => {
        const tool = mockServer.getTool('select_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');

        const result = await tool.cb({ name: 'NonExistentSheet' }, ctx);

        // Should return error
        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes('not found') || c.text.includes('error')));
    });
});

test('create_sheet adds new sheet', async () => {
    await run(async () => {
        const tool = mockServer.getTool('create_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');

        const result = await tool.cb({ name: 'NewSheet' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.sheet, 'NewSheet');
        assert.equal(result.structuredContent.status, 'created');

        // Verify it appears in list
        const listTool = mockServer.getTool('list_sheets');
        const listResult = await listTool.cb({}, ctx);
        assert.ok(listResult.structuredContent.sheets.includes('NewSheet'));
    });
});

test('create_sheet handles duplicate names', async () => {
    await run(async () => {
        const tool = mockServer.getTool('create_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');

        // Try to create a sheet with existing name
        const result = await tool.cb({ name: 'Sheet1' }, ctx);

        // Should handle gracefully (either auto-rename or error)
        assert.ok(result.content);
    });
});

test('rename_sheet changes sheet name', async () => {
    await run(async () => {
        // Create a sheet to rename
        const createTool = mockServer.getTool('create_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');
        await createTool.cb({ name: 'ToRename' }, ctx);

        const renameTool = mockServer.getTool('rename_sheet');
        const result = await renameTool.cb({ oldName: 'ToRename', newName: 'Renamed' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.oldName, 'ToRename');
        assert.equal(result.structuredContent.newName, 'Renamed');
        assert.equal(result.structuredContent.status, 'renamed');

        // Verify old name gone, new name present
        const listTool = mockServer.getTool('list_sheets');
        const listResult = await listTool.cb({}, ctx);
        assert.ok(!listResult.structuredContent.sheets.includes('ToRename'));
        assert.ok(listResult.structuredContent.sheets.includes('Renamed'));
    });
});

test('rename_sheet validates new name', async () => {
    await run(async () => {
        const tool = mockServer.getTool('rename_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');

        // Try invalid characters
        const result = await tool.cb({ oldName: 'Sheet1', newName: 'Invalid/Name' }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes('invalid') || c.text.includes('error')));
    });
});

test('delete_sheet removes sheet', async () => {
    await run(async () => {
        // Create a sheet to delete
        const createTool = mockServer.getTool('create_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');
        await createTool.cb({ name: 'ToDelete' }, ctx);

        const deleteTool = mockServer.getTool('delete_sheet');
        const result = await deleteTool.cb({ name: 'ToDelete' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.sheet, 'ToDelete');
        assert.equal(result.structuredContent.status, 'deleted');

        // Verify it's gone
        const listTool = mockServer.getTool('list_sheets');
        const listResult = await listTool.cb({}, ctx);
        assert.ok(!listResult.structuredContent.sheets.includes('ToDelete'));
    });
});

test('delete_sheet prevents deleting last sheet', async () => {
    await run(async () => {
        const tool = mockServer.getTool('delete_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');

        // Get current sheets, delete all but one, then try to delete last
        const listTool = mockServer.getTool('list_sheets');
        const listResult = await listTool.cb({}, ctx);
        const sheets = listResult.structuredContent.sheets;

        // Delete all but one
        for (const sheet of sheets.slice(1)) {
            await tool.cb({ name: sheet }, ctx);
        }

        // Try to delete the last one
        const lastSheet = sheets[0];
        const result = await tool.cb({ name: lastSheet }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.some((c: any) => c.text.includes('cannot delete') || c.text.includes('last sheet') || c.text.includes('error')));
    });
});

test('copy_sheet duplicates sheet', async () => {
    await run(async () => {
        const tool = mockServer.getTool('copy_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');

        const result = await tool.cb({ sourceName: 'Sheet1', targetName: 'Sheet1_Copy' }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.sourceSheet, 'Sheet1');
        assert.equal(result.structuredContent.targetSheet, 'Sheet1_Copy');
        assert.equal(result.structuredContent.status, 'copied');

        // Verify both exist
        const listTool = mockServer.getTool('list_sheets');
        const listResult = await listTool.cb({}, ctx);
        assert.ok(listResult.structuredContent.sheets.includes('Sheet1'));
        assert.ok(listResult.structuredContent.sheets.includes('Sheet1_Copy'));
    });
});

test('move_sheet changes sheet position', async () => {
    await run(async () => {
        // Create a few sheets first
        const createTool = mockServer.getTool('create_sheet');
        const ctx = createMockRequestContext('sheet-ops-flow-test');
        await createTool.cb({ name: 'SheetA' }, ctx);
        await createTool.cb({ name: 'SheetB' }, ctx);
        await createTool.cb({ name: 'SheetC' }, ctx);

        const moveTool = mockServer.getTool('move_sheet');
        const result = await moveTool.cb({ name: 'SheetC', position: 1 }, ctx); // Move to second position

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.sheet, 'SheetC');
        assert.equal(result.structuredContent.position, 1);
        assert.equal(result.structuredContent.status, 'moved');

        // Verify order
        const listTool = mockServer.getTool('list_sheets');
        const listResult = await listTool.cb({}, ctx);
        const sheets = listResult.structuredContent.sheets;
        const sheetCIndex = sheets.indexOf('SheetC');
        assert.equal(sheetCIndex, 1); // Should be at index 1 (second position)
    });
});

export default test;