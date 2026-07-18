import fc from 'fast-check';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { run, getContext } from '../../src/util/requestContext.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { SheetHandler } from '../../src/tools/handleSheet.js';
export default function (test: any) {


    async function withContext(fn: (mockServer: MockMcpServer) => Promise<void>) {
        const mockServer = new MockMcpServer();
        let testContext;
        const mockCtx = { authInfo: { extra: { userId: 'sheet-props' } } };

        await run(async () => {
            testContext = await createTestContext('sheet-props');
            const reqCtx = getContext();
            reqCtx.context = testContext;
            reqCtx.virtualFileSystem = testContext.virtualFileSystem;
            reqCtx.release = async () => {};

            const wbTools = new WorkbookTools();
            wbTools.server = mockServer as any;
            wbTools.context = mockCtx as any;
            wbTools.expressApp = { get: () => {}, post: () => {} } as any;
            wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
            await wbTools.register([]);

            const sheetHandler = new SheetHandler();
            sheetHandler.server = mockServer as any;
            sheetHandler.context = mockCtx as any;
            await sheetHandler.register([]);

            const ctx = createMockRequestContext('sheet-props');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'sheet-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

            await fn(mockServer);
        });

        await testContext.cleanup();
    }

    test('create_sheet adds sheet and lists it', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('sheet-props');
            const result = await mockServer.getTool('create_sheet').cb({ name: 'Sheet2' }, ctx);
            assert.equal(result.structuredContent.action, 'created');
            assert.equal(result.structuredContent.sheet, 'Sheet2');
            assert.ok(result.structuredContent.sheets.includes('Sheet2'));
        });
    });

    test('list_sheets returns all created sheets', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('sheet-props');
            const result = await mockServer.getTool('list_sheets').cb({}, ctx);
            assert.ok(result.structuredContent.sheets);
            assert.ok(result.structuredContent.sheets.length >= 1);
        });
    });

    test('create N sheets then list has N+initial total', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('sheet-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 4 }),
                    async (n) => {
                        const listBefore = await mockServer.getTool('list_sheets').cb({}, ctx);
                        const countBefore = listBefore.structuredContent.sheets.length;

                        for (let i = 0; i < n; i++) {
                            const name = `PropSheet${Date.now()}_${i}`;
                            await mockServer.getTool('create_sheet').cb({ name }, ctx);
                        }

                        const listAfter = await mockServer.getTool('list_sheets').cb({}, ctx);
                        assert.equal(listAfter.structuredContent.sheets.length, countBefore + n);
                    }
                ),
                { numRuns: 5 }
            );
        });
    });

    test('rename_sheet changes sheet name in list', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('sheet-props');
            await mockServer.getTool('create_sheet').cb({ name: 'OldName' }, ctx);

            const result = await mockServer.getTool('rename_sheet').cb({ oldName: 'OldName', newName: 'NewName' }, ctx);
            assert.equal(result.structuredContent.action, 'renamed');
            assert.equal(result.structuredContent.newName, 'NewName');

            const list = await mockServer.getTool('list_sheets').cb({}, ctx);
            assert.ok(list.structuredContent.sheets.includes('NewName'));
            assert.ok(!list.structuredContent.sheets.includes('OldName'));
        });
    });

    test('delete_sheet removes sheet from list', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('sheet-props');
            await mockServer.getTool('create_sheet').cb({ name: 'ToDelete' }, ctx);

            const result = await mockServer.getTool('delete_sheet').cb({ name: 'ToDelete' }, ctx);
            assert.equal(result.structuredContent.action, 'deleted');

            const list = await mockServer.getTool('list_sheets').cb({}, ctx);
            assert.ok(!list.structuredContent.sheets.includes('ToDelete'));
        });
    });

    test('create then rename then list reflects final state', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('sheet-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 3, maxLength: 8 }).filter(s => /^[A-Za-z0-9]+$/.test(s)),
                    fc.string({ minLength: 3, maxLength: 8 }).filter(s => /^[A-Za-z0-9]+$/.test(s)),
                    async (original, renamed) => {
                        if (original === renamed) return;
                        await mockServer.getTool('delete_sheet').cb({ name: original }, ctx);
                        await mockServer.getTool('delete_sheet').cb({ name: renamed }, ctx);
                        await mockServer.getTool('create_sheet').cb({ name: original }, ctx);
                        await mockServer.getTool('rename_sheet').cb({ oldName: original, newName: renamed }, ctx);

                        const list = await mockServer.getTool('list_sheets').cb({}, ctx);
                        assert.ok(list.structuredContent.sheets.includes(renamed));
                        assert.ok(!list.structuredContent.sheets.includes(original));
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('select_sheet sets active sheet', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('sheet-props');
            await mockServer.getTool('create_sheet').cb({ name: 'Selectable' }, ctx);
            const result = await mockServer.getTool('select_sheet').cb({ name: 'Selectable' }, ctx);
            assert.equal(result.structuredContent.action, 'selected');
            assert.equal(result.structuredContent.sheet, 'Selectable');
        });
    });

    }
