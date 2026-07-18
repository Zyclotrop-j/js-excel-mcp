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


    async function withContext(fn: (mockServer: MockMcpServer) => Promise<void>) {
        const mockServer = new MockMcpServer();
        const testContext = await createTestContext('cell-props');
        const mockCtx = { authInfo: { extra: { userId: 'cell-props' } } };

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

            const ctx = createMockRequestContext('cell-props');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'cell-test.xlsx' }, ctx);
            await mockServer.getTool('create_sheet').cb({ name: 'Sheet1' }, ctx);

            await fn(mockServer);
        });

        await testContext.cleanup();
    }

    test('diagnostic: write and read single value', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            await mockServer.getTool('set_cell').cb({ ref: 'A1', value: 'first' }, ctx);
            const r1 = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
            console.log(`After write 'first': read=${JSON.stringify(r1.structuredContent.value)}`);

            await mockServer.getTool('set_cell').cb({ ref: 'A1', value: 'second' }, ctx);
            const r2 = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
            console.log(`After write 'second': read=${JSON.stringify(r2.structuredContent.value)}`);

            await mockServer.getTool('set_cell').cb({ ref: 'A1', value: '!' }, ctx);
            const r3 = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
            console.log(`After write '!': read=${JSON.stringify(r3.structuredContent.value)}`);

            await mockServer.getTool('set_cell').cb({ ref: 'A1', value: 'after!' }, ctx);
            const r4 = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
            console.log(`After write 'after!': read=${JSON.stringify(r4.structuredContent.value)}`);
        });
    });

    test('write then read string round-trips', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            await fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0),
                    async (value) => {
                        const setResult = await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
                        const getResult = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
                        if (getResult.structuredContent.value !== value) {
                            console.log(`MISMATCH: wrote=${JSON.stringify(value)}, read=${JSON.stringify(getResult.structuredContent.value)}, setResult=${JSON.stringify(setResult.structuredContent)}`);
                        }
                        assert.equal(getResult.structuredContent.value, value);
                    }
                ),
                { numRuns: 5, verbose: true }
            );
        });
    });

    test('write then read integer round-trips', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            await fc.assert(
                fc.property(
                    fc.integer({ min: -10000, max: 10000 }),
                    async (value) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'B1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'B1' }, ctx);
                        assert.equal(Number(result.structuredContent.value), value);
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    test('write then read float round-trips', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            await fc.assert(
                fc.property(
                    fc.float({ min: -1000, max: 1000, noNaN: true }),
                    async (value) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'C1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'C1' }, ctx);
                        assert.equal(Number(result.structuredContent.value), value);
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    test('write then read boolean round-trips', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            await fc.assert(
                fc.property(
                    fc.boolean(),
                    async (value) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'D1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'D1' }, ctx);
                        assert.equal(result.structuredContent.value, String(value));
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('different cells written independently', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            await fc.assert(
                fc.property(
                    fc.constantFrom('E1', 'F1', 'G1', 'H1'),
                    fc.oneof(
                        fc.string({ maxLength: 8 }).filter(s => s.trim().length > 0),
                        fc.integer({ min: 0, max: 999 })
                    ),
                    async (ref, value) => {
                        await mockServer.getTool('set_cell').cb({ ref, value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref }, ctx);
                        assert.equal(String(result.structuredContent.value), String(value));
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    test('set_cell output includes ref', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            const result = await mockServer.getTool('set_cell').cb({ ref: 'I1', value: 'check' }, ctx);
            assert.equal(result.structuredContent.ref, 'I1');
        });
    });

    test('get_cell output includes ref', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            await mockServer.getTool('set_cell').cb({ ref: 'J1', value: 42 }, ctx);
            const result = await mockServer.getTool('get_cell').cb({ ref: 'J1' }, ctx);
            assert.equal(result.structuredContent.ref, 'J1');
        });
    });

    test('overwriting a cell replaces previous value', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            await fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
                    fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
                    async (first, second) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'K1', value: first }, ctx);
                        await mockServer.getTool('set_cell').cb({ ref: 'K1', value: second }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'K1' }, ctx);
                        assert.equal(result.structuredContent.value, second);
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    test('empty string round-trips', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('cell-props');
            await mockServer.getTool('set_cell').cb({ ref: 'L1', value: '' }, ctx);
            const result = await mockServer.getTool('get_cell').cb({ ref: 'L1' }, ctx);
            assert.equal(result.structuredContent.value, '');
        });
    });

    }
