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
        let testContext;
        const mockCtx = { authInfo: { extra: { userId: 'encoding-props' } } };

        await run(async () => {
            testContext = await createTestContext('encoding-props');
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

            const ctx = createMockRequestContext('encoding-props');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'encoding-test.xlsx' }, ctx);
            await mockServer.getTool('create_sheet').cb({ name: 'Sheet1' }, ctx);

            await fn(mockServer);
        });

        await testContext.cleanup();
    }

    test('unicode characters preserved through write-read', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('encoding-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom(
                        'caf\u00e9', 'na\u00efve', 'r\u00e9sum\u00e9', '\u00fcber', '\u00e4-\u00f6-\u00fc', '\u00df,\u00e7,\u00f8', '\u014d\u0259-\u014b-\u0272\u026f',
                        'DY\u0192?D,D\u0186D\u0187,', 'U.O\u0190O-O"O\u01af', 'I"I\u0130I1I\u0131 I\u0130I\u0131I.', 'dY`<dYZ%', '\u00a3,\u20ac100', '\u00a92024'
                    ),
                    async (value) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
                        assert.equal(result.structuredContent.value, value);
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    test('whitespace strings preserved', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('encoding-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('  ', '\t', ' \t ', '  hello  '),
                    async (value) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
                        assert.equal(result.structuredContent.value, value);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('special spreadsheet characters preserved', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('encoding-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('=', '+', '-', '@', '#', '$', '%', '&', '!', '?', '~', '`'),
                    async (value) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
                        assert.equal(result.structuredContent.value, value);
                    }
                ),
                { numRuns: 15 }
            );
        });
    });

    test('mixed alphanumeric strings round-trip', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('encoding-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 20 }).filter(s =>
                        s.trim().length > 0 && /^[\w\s.-]+$/.test(s)
                    ),
                    async (value) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
                        assert.equal(result.structuredContent.value, value);
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    test('strings with spaces round-trip', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('encoding-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.array(fc.string({ minLength: 1, maxLength: 5 }).filter(s => /^[a-z]+$/.test(s)), { minLength: 2, maxLength: 4 }),
                    async (words) => {
                        const value = words.join(' ');
                        await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
                        assert.equal(result.structuredContent.value, value);
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    test('long strings round-trip', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('encoding-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 50, maxLength: 200 }).filter(s => s.trim().length > 0),
                    async (value) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
                        assert.equal(result.structuredContent.value, value);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('emoji and special unicode preserved', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('encoding-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('\ud83d\ude80%', '\ud83d\udd25s?', '\u2603\u0299.', '\u2764\ufe0f"\u2764\ufe0f', '\u00fc\u0278.', '\u00e4?O', '\u01b9s\u026f,\u0272?', 'dY"\u2019\u2019'),
                    async (value) => {
                        await mockServer.getTool('set_cell').cb({ ref: 'A1', value }, ctx);
                        const result = await mockServer.getTool('get_cell').cb({ ref: 'A1' }, ctx);
                        assert.equal(result.structuredContent.value, value);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('multiple cells with different encodings', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('encoding-props');
            const values = ['caf\u00e9', '\u00e4-\u00f6-\u00fc', 'DY\u0192?D,D\u0186D\u0187,', '\u00a3,\u20ac100', 'dYZ%'];
            for (let i = 0; i < values.length; i++) {
                const ref = `${String.fromCharCode(65 + i)}1`;
                await mockServer.getTool('set_cell').cb({ ref, value: values[i] }, ctx);
            }
            for (let i = 0; i < values.length; i++) {
                const ref = `${String.fromCharCode(65 + i)}1`;
                const result = await mockServer.getTool('get_cell').cb({ ref }, ctx);
                assert.equal(result.structuredContent.value, values[i]);
            }
        });
    });

    }
