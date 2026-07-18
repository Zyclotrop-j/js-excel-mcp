import fc from 'fast-check';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { run, getContext } from '../../src/util/requestContext.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { CellReadHandler } from '../../src/tools/handleCells/read.js';
import { SheetHandler } from '../../src/tools/handleSheet.js';
export default function (test: any) {


    let mockServer: MockMcpServer;

    function colLetter(index: number): string {
        let s = '';
        let n = index;
        while (n >= 0) {
            s = String.fromCharCode(65 + (n % 26)) + s;
            n = Math.floor(n / 26) - 1;
        }
        return s;
    }

    async function withContext(fn: (mockServer: MockMcpServer) => Promise<void>) {
        mockServer = new MockMcpServer();
        const testContext = await createTestContext('range-props');
        const mockCtx = { authInfo: { extra: { userId: 'range-props' } } };

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

            const sheetHandler = new SheetHandler();
            sheetHandler.server = mockServer as any;
            sheetHandler.context = mockCtx as any;
            await sheetHandler.register([]);

            const ctx = createMockRequestContext('range-props');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'range-test.xlsx' }, ctx);
            await mockServer.getTool('create_sheet').cb({ name: 'Sheet1' }, ctx);

            await fn(mockServer);
        });

        await testContext.cleanup();
    }

    test('set_cells then get_range returns correct row count', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('range-props');
            const values = [['a', 'b', 'c'], ['d', 'e', 'f']];
            const result = await mockServer.getTool('set_cells').cb({ range: 'A1:C2', values }, ctx);
            assert.equal(result.structuredContent.rows, 2);
            assert.equal(result.structuredContent.range, 'A1:C2');
        });
    });

    test('get_range output includes range string', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('range-props');
            const result = await mockServer.getTool('get_range').cb({ range: 'A1:B2' }, ctx);
            assert.equal(result.structuredContent.range, 'A1:B2');
        });
    });

    test('single cell set_cells and get_range round-trips', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('range-props');
            await fc.assert(
                fc.property(
                    fc.oneof(fc.string({ maxLength: 5 }).filter(s => s.trim().length > 0), fc.integer({ min: 0, max: 100 })),
                    async (value) => {
                        const values = [[value]];
                        await mockServer.getTool('set_cells').cb({ range: 'A1:A1', values }, ctx);
                        const result = await mockServer.getTool('get_range').cb({ range: 'A1:A1' }, ctx);
                        assert.ok(result.structuredContent.values);
                        assert.equal(result.structuredContent.values[0][0], value);
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    test('set_cells row count matches input length', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('range-props');
            await fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 5 }),
                    async (n) => {
                        const values = Array.from({ length: n }, (_, i) => [i]);
                        const result = await mockServer.getTool('set_cells').cb({ range: `A1:A${n}`, values }, ctx);
                        assert.equal(result.structuredContent.rows, n);
                    }
                ),
                { numRuns: 8 }
            );
        });
    });

    test('written values match read values across a row', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('range-props');
            await fc.assert(
                fc.property(
                    fc.array(fc.oneof(fc.string({ maxLength: 3 }).filter(s => s.trim().length > 0), fc.integer({ min: 0, max: 99 })), { minLength: 2, maxLength: 5 }),
                    async (row) => {
                        const endCol = colLetter(row.length - 1);
                        const range = `A1:${endCol}1`;
                        await mockServer.getTool('set_cells').cb({ range, values: [row] }, ctx);
                        const result = await mockServer.getTool('get_range').cb({ range }, ctx);
                        assert.ok(result.structuredContent.values);
                        for (let i = 0; i < row.length; i++) {
                            assert.equal(String(result.structuredContent.values[0][i]), String(row[i]));
                        }
                    }
                ),
                { numRuns: 15 }
            );
        });
    });

    test('written values match read values down a column', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('range-props');
            await fc.assert(
                fc.property(
                    fc.array(fc.oneof(fc.string({ maxLength: 3 }).filter(s => s.trim().length > 0), fc.integer({ min: 0, max: 99 })), { minLength: 2, maxLength: 5 }),
                    async (col) => {
                        const range = `A1:A${col.length}`;
                        const values = col.map(v => [v]);
                        await mockServer.getTool('set_cells').cb({ range, values }, ctx);
                        const result = await mockServer.getTool('get_range').cb({ range }, ctx);
                        assert.ok(result.structuredContent.values);
                        for (let i = 0; i < col.length; i++) {
                            assert.equal(String(result.structuredContent.values[i][0]), String(col[i]));
                        }
                    }
                ),
                { numRuns: 15 }
            );
        });
    });

    test('set_cells 2D grid and get_range returns all values', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('range-props');
            await fc.assert(
                fc.property(
                    fc.array(fc.array(fc.oneof(fc.string({ maxLength: 3 }), fc.integer({ min: 0, max: 99 })), { minLength: 1, maxLength: 3 }), { minLength: 1, maxLength: 3 }),
                    async (values) => {
                        const rows = values.length;
                        const cols = Math.max(...values.map(r => r.length));
                        const endRef = `${colLetter(cols - 1)}${rows}`;
                        const range = `A1:${endRef}`;
                        await mockServer.getTool('set_cells').cb({ range, values }, ctx);
                        const result = await mockServer.getTool('get_range').cb({ range }, ctx);
                        assert.ok(result.structuredContent.values);
                        assert.equal(result.structuredContent.values.length, rows);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    }
