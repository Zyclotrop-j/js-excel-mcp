/**
 * Strengthened cursor-property tests for move_cell_cursor.
 *
 * Whereas test/property/cursor-properties.test.ts only asserts
 * `result.structuredContent` is truthy, these tests pin the actual cursor
 * position returned in `structuredContent.to`.
 *
 * Invariants (within column range A..J and row range 1..10):
 *  - N steps right then N steps left returns the cursor to the starting cell.
 *  - N steps down from A1 lands on row 1+N (column letter unchanged).
 *  - The "A1" cellref survives a right/left round-trip.
 *
 * Note: fast-check async predicates must use `fc.asyncProperty`, not
 * `fc.property` (the latter treats a returned Promise as falsy and fails
 * every run with "Property failed by returning false").
 */
import fc from 'fast-check';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { run, getContext } from '../../src/util/requestContext.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { CellCursorHandler } from '../../src/tools/handleCells/cursor.js';
import { SheetHandler } from '../../src/tools/handleSheet.js';

const REF_RE = /^([A-Z]+)(\d+)$/;

function parseRef(ref: string): { col: string; row: number } {
    const m = REF_RE.exec(String(ref));
    if (!m) throw new Error(`unparseable cell ref: ${ref}`);
    return { col: m[1], row: Number(m[2]) };
}

export default function (test: any) {
    async function withContext(fn: (mockServer: MockMcpServer) => Promise<void>) {
        const mockServer = new MockMcpServer();
        let testContext;
        const mockCtx = { authInfo: { extra: { userId: 'cursor-v2' } } };

        await run(async () => {
            testContext = await createTestContext('cursor-v2');
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

            const cellCursor = new CellCursorHandler();
            cellCursor.server = mockServer as any;
            cellCursor.context = mockCtx as any;
            await cellCursor.register([]);

            const sheetHandler = new SheetHandler();
            sheetHandler.server = mockServer as any;
            sheetHandler.context = mockCtx as any;
            await sheetHandler.register([]);

            const ctx = createMockRequestContext('cursor-v2');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'cursor-v2.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);
            // Establish the cursor at A1 (set_cell sets the cursor as a side effect).
            await mockServer.getTool('set_cell').cb({ ref: 'A1', value: 'origin' }, ctx);

            await fn(mockServer);
        });

        await testContext.cleanup();
    }

    test('cursor v2: N steps right then N steps left returns to A1 (single call)', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-v2');
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 10 }),
                    async (n) => {
                        const result = await mockServer.getTool('move_cell_cursor').cb({
                            moves: [
                                { direction: 'right', count: n },
                                { direction: 'left', count: n }
                            ]
                        }, ctx);
                        assert.equal(result.isError, undefined, `expected no error for n=${n}`);
                        const to = result.structuredContent.to;
                        assert.ok(typeof to === 'string', `missing 'to' for n=${n}`);
                        const parsed = parseRef(to);
                        assert.equal(parsed.col, 'A', `expected column A, got ${parsed.col} for n=${n}`);
                        assert.equal(parsed.row, 1, `expected row 1, got ${parsed.row} for n=${n}`);
                        assert.equal(to, 'A1', `expected A1, got ${to} for n=${n}`);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('cursor v2: N steps down from A1 lands on row 1+N (column A)', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-v2');
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 10 }),
                    async (n) => {
                        // Reset cursor to A1 between runs so the test is independent of prior state.
                        await mockServer.getTool('move_cell_cursor').cb({
                            moves: [{ direction: 'jump', target: 'A1' }]
                        }, ctx);
                        const result = await mockServer.getTool('move_cell_cursor').cb({
                            moves: [{ direction: 'down', count: n }]
                        }, ctx);
                        assert.equal(result.isError, undefined, `expected no error for n=${n}`);
                        const to = result.structuredContent.to;
                        assert.ok(typeof to === 'string', `missing 'to' for n=${n}`);
                        const parsed = parseRef(to);
                        assert.equal(parsed.col, 'A', `expected column A, got ${parsed.col} for n=${n}`);
                        assert.equal(parsed.row, 1 + n, `expected row ${1 + n}, got ${parsed.row} for n=${n}`);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('cursor v2: A1 survives a right/left round-trip via the from field', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cursor-v2');
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 1, max: 10 }),
                    async (n) => {
                        // Re-anchor to A1 between runs.
                        await mockServer.getTool('move_cell_cursor').cb({
                            moves: [{ direction: 'jump', target: 'A1' }]
                        }, ctx);
                        const result = await mockServer.getTool('move_cell_cursor').cb({
                            moves: [
                                { direction: 'right', count: n },
                                { direction: 'left', count: n }
                            ]
                        }, ctx);
                        assert.equal(result.isError, undefined, `expected no error for n=${n}`);
                        const { from, to } = result.structuredContent;
                        assert.equal(from, 'A1', `'from' should reflect A1 for n=${n}`);
                        assert.equal(to, 'A1', `'to' should return to A1 for n=${n}`);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });
}