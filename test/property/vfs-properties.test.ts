import fc from 'fast-check';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { run, getContext } from '../../src/util/requestContext.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
export default function (test: any) {


    async function withContext(fn: (mockServer: MockMcpServer, testContext: any) => Promise<void>) {
        const mockServer = new MockMcpServer();
        let testContext;
        const mockCtx = { authInfo: { extra: { userId: 'vfs-props' } } };

        await run(async () => {
            testContext = await createTestContext('vfs-props');
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

            await fn(mockServer, testContext);
        });

        await testContext.cleanup();
    }

    test('create_new_workbook returns created status and filename', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('vfs-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
                    async (filename) => {
                        const result = await mockServer.getTool('create_new_workbook').cb({ filename: `${filename}.xlsx` }, ctx);
                        assert.equal(result.structuredContent.filename, `${filename}.xlsx`);
                        assert.equal(result.structuredContent.status, 'created');
                        assert.ok(Array.isArray(result.structuredContent.sheets));
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('created workbook appears in list_open_workbook', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('vfs-props');
            const result = await mockServer.getTool('create_new_workbook').cb({ filename: 'vfs-list-test.xlsx' }, ctx);
            assert.equal(result.structuredContent.filename, 'vfs-list-test.xlsx');

            const list = await mockServer.getTool('list_open_workbook').cb({}, ctx);
            assert.ok(Array.isArray(list.structuredContent.files));
            assert.ok(list.structuredContent.files.includes('vfs-list-test.xlsx'));
        });
    });

    test('create N workbooks then list includes all', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('vfs-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 3 }),
                    async (n) => {
                        const listBefore = await mockServer.getTool('list_open_workbook').cb({}, ctx);
                        const countBefore = listBefore.structuredContent.files.length;

                        for (let i = 0; i < n; i++) {
                            await mockServer.getTool('create_new_workbook').cb({ filename: `multi-${Date.now()}-${i}.xlsx` }, ctx);
                        }

                        const listAfter = await mockServer.getTool('list_open_workbook').cb({}, ctx);
                        assert.equal(listAfter.structuredContent.files.length, countBefore + n);
                    }
                ),
                { numRuns: 5 }
            );
        });
    });

    test('close_workbook removes workbook from list', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('vfs-props');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'to-close.xlsx' }, ctx);

            const listBefore = await mockServer.getTool('list_open_workbook').cb({}, ctx);
            assert.ok(listBefore.structuredContent.files.includes('to-close.xlsx'));

            const closeResult = await mockServer.getTool('close_workbook').cb({ filename: 'to-close.xlsx' }, ctx);
            assert.equal(closeResult.structuredContent.filename, 'to-close.xlsx');
            assert.equal(closeResult.structuredContent.status, 'closed');

            const listAfter = await mockServer.getTool('list_open_workbook').cb({}, ctx);
            assert.ok(!listAfter.structuredContent.files.includes('to-close.xlsx'));
        });
    });

    test('close_workbook on nonexistent returns error', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('vfs-props');
            const result = await mockServer.getTool('close_workbook').cb({ filename: 'nonexistent.xlsx' }, ctx);
            assert.ok(result.content);
            assert.ok(result.content.some((c: any) => c.text.includes("doesn't exist") || c.text.includes('not found') || c.text.includes('error')));
        });
    });

    test('create then close then create again with same name', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('vfs-props');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'reuse.xlsx' }, ctx);
            await mockServer.getTool('close_workbook').cb({ filename: 'reuse.xlsx' }, ctx);

            const result = await mockServer.getTool('create_new_workbook').cb({ filename: 'reuse.xlsx' }, ctx);
            assert.equal(result.structuredContent.filename, 'reuse.xlsx');
            assert.equal(result.structuredContent.status, 'created');
        });
    });

    test('create_new_workbook sets as current file', async () => {
        await withContext(async (mockServer, testContext) => {
            const ctx = createMockRequestContext('vfs-props');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'current-test.xlsx' }, ctx);
            const currentFile = await testContext.getCurrentFile();
            assert.equal(currentFile, 'current-test.xlsx');
        });
    });

    }
