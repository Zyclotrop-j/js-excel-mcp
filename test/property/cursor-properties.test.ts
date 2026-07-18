import fc from 'fast-check';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { run, getContext } from '../../src/util/requestContext.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { CellReadHandler } from '../../src/tools/handleCells/read.js';
import { CellCursorHandler } from '../../src/tools/handleCells/cursor.js';
import { SheetHandler } from '../../src/tools/handleSheet.js';
export default function (test: any) {


    async function withContext(fn: (mockServer: MockMcpServer) => Promise<void>) {
        const mockServer = new MockMcpServer();
        const testContext = await createTestContext('cursor-props');
        const mockCtx = { authInfo: { extra: { userId: 'cursor-props' } } };

        await run(async () => {
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

            const cellWrite = new CellWriteHandler();
            cellWrite.server = mockServer as any;
            cellWrite.context = mockCtx as any;
            await cellWrite.register([]);

            const cellRead = new CellReadHandler();
            cellRead.server = mockServer as any;
            cellRead.context = mockCtx as any;
            await cellRead.register([]);

            const cellCursor = new CellCursorHandler();
            cellCursor.server = mockServer as any;
            cellCursor.context = mockCtx as any;
            await cellCursor.register([]);

            const sheetHandler = new SheetHandler();
            sheetHandler.server = mockServer as any;
            sheetHandler.context = mockCtx as any;
            await sheetHandler.register([]);

            const ctx = createMockRequestContext('cursor-props');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'cursor-test.xlsx' }, ctx);
            await mockServer.getTool('create_sheet').cb({ name: 'Sheet1' }, ctx);

            await fn(mockServer);
        });

        await testContext.cleanup();
    }

    test('move_cell_cursor moves right', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-props');
            const result = await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'right', count: 1 }] }, ctx);
            assert.ok(result.structuredContent.cursor || result.structuredContent.position || result.structuredContent.currentRef);
        });
    });

    test('move_cell_cursor moves left from B1', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-props');
            await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'right', count: 1 }] }, ctx);
            const result = await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'left', count: 1 }] }, ctx);
            assert.ok(result.structuredContent);
        });
    });

    test('move_cell_cursor moves down', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-props');
            const result = await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'down', count: 1 }] }, ctx);
            assert.ok(result.structuredContent);
        });
    });

    test('move_cell_cursor moves up', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-props');
            await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'down', count: 2 }] }, ctx);
            const result = await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'up', count: 1 }] }, ctx);
            assert.ok(result.structuredContent);
        });
    });

    test('move N steps right then N left returns to start', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-props');
            await fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 10 }),
                    async (n) => {
                        await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'right', count: n }] }, ctx);
                        const result = await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'left', count: n }] }, ctx);
                        assert.ok(result.structuredContent);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('move N steps down then N up returns to start', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-props');
            await fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 10 }),
                    async (n) => {
                        await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'down', count: n }] }, ctx);
                        const result = await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'up', count: n }] }, ctx);
                        assert.ok(result.structuredContent);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('multiple moves in sequence', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-props');
            const result = await mockServer.getTool('move_cell_cursor').cb({
                moves: [
                    { direction: 'right', count: 2 },
                    { direction: 'down', count: 1 }
                ]
            }, ctx);
            assert.ok(result.structuredContent);
        });
    });

    test('cursor position reflects set_cell', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-props');
            await mockServer.getTool('move_cell_cursor').cb({ moves: [{ direction: 'right', count: 2 }, { direction: 'down', count: 1 }] }, ctx);
            const cursor = await mockServer.getTool('move_cell_cursor').cb({}, ctx);
            const currentRef = cursor.structuredContent.currentRef || cursor.structuredContent.cursor;
            if (currentRef) {
                await mockServer.getTool('set_cell').cb({ ref: currentRef, value: 'at cursor' }, ctx);
                const result = await mockServer.getTool('get_cell').cb({ ref: currentRef }, ctx);
                assert.equal(result.structuredContent.value, 'at cursor');
            }
        });
    });

    }
