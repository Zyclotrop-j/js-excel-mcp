import fc from 'fast-check';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { run, getContext } from '../../src/util/requestContext.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { CellReadHandler } from '../../src/tools/handleCells/read.js';
import { StyleHandler } from '../../src/tools/handleStyle.js';
import { SheetHandler } from '../../src/tools/handleSheet.js';
export default function (test: any) {


    async function withContext(fn: (mockServer: MockMcpServer) => Promise<void>) {
        const mockServer = new MockMcpServer();
        let testContext;
        const mockCtx = { authInfo: { extra: { userId: 'style-props' } } };

        await run(async () => {
            testContext = await createTestContext('style-props');
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

            const styleHandler = new StyleHandler();
            styleHandler.server = mockServer as any;
            styleHandler.context = mockCtx as any;
            await styleHandler.register([]);

            const sheetHandler = new SheetHandler();
            sheetHandler.server = mockServer as any;
            sheetHandler.context = mockCtx as any;
            await sheetHandler.register([]);

            const ctx = createMockRequestContext('style-props');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'style-test.xlsx' }, ctx);
            await mockServer.getTool('create_sheet').cb({ name: 'Sheet1' }, ctx);

            await fn(mockServer);
        });

        await testContext.cleanup();
    }

    test('set_cell_bold returns correct ref and bold', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('A1', 'B2', 'C3', 'D4'),
                    fc.boolean(),
                    async (ref, bold) => {
                        const result = await mockServer.getTool('set_cell_bold').cb({ ref, bold }, ctx);
                        assert.equal(result.structuredContent.ref, ref);
                        assert.equal(result.structuredContent.bold, bold);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('set_cell_bold true', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            const result = await mockServer.getTool('set_cell_bold').cb({ ref: 'A1', bold: true }, ctx);
            assert.equal(result.structuredContent.bold, true);
        });
    });

    test('set_cell_bold false', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            const result = await mockServer.getTool('set_cell_bold').cb({ ref: 'A1', bold: false }, ctx);
            assert.equal(result.structuredContent.bold, false);
        });
    });

    test('set_cell_font returns correct fontSize', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('A1', 'B1', 'C1'),
                    fc.integer({ min: 6, max: 72 }),
                    async (ref, fontSize) => {
                        const result = await mockServer.getTool('set_cell_font').cb({ ref, fontSize }, ctx);
                        assert.equal(result.structuredContent.ref, ref);
                        assert.equal(result.structuredContent.fontSize, fontSize);
                    }
                ),
                { numRuns: 10 }
            );
        });
    });

    test('set_cell_font returns correct fontName', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('Arial', 'Courier New', 'Times New Roman', 'Verdana'),
                    async (fontName) => {
                        const result = await mockServer.getTool('set_cell_font').cb({ ref: 'A1', fontName }, ctx);
                        assert.equal(result.structuredContent.fontName, fontName);
                    }
                ),
                { numRuns: 5 }
            );
        });
    });

    test('set_cell_font returns correct fontColor', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('FFFF0000', 'FF00FF00', 'FF0000FF'),
                    async (fontColor) => {
                        const result = await mockServer.getTool('set_cell_font').cb({ ref: 'A1', fontColor }, ctx);
                        assert.equal(result.structuredContent.fontColor, fontColor);
                    }
                ),
                { numRuns: 5 }
            );
        });
    });

    test('set_cell_background_color returns correct color', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('FFFFFF00', 'FFFF0000', 'FF00FF00'),
                    async (color) => {
                        const result = await mockServer.getTool('set_cell_background_color').cb({ ref: 'A1', color }, ctx);
                        assert.equal(result.structuredContent.ref, 'A1');
                        assert.equal(result.structuredContent.color, color);
                    }
                ),
                { numRuns: 5 }
            );
        });
    });

    test('set_cell_alignment returns correct properties', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            const result = await mockServer.getTool('set_cell_alignment').cb({
                ref: 'A1', horizontal: 'center', vertical: 'middle', wrapText: true
            }, ctx);
            assert.equal(result.structuredContent.ref, 'A1');
            assert.equal(result.structuredContent.horizontal, 'center');
            assert.equal(result.structuredContent.vertical, 'middle');
            assert.equal(result.structuredContent.wrapText, true);
        });
    });

    test('set_cell_alignment horizontal values round-trip', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            await fc.assert(
                fc.asyncProperty(
                    fc.constantFrom('left', 'center', 'right'),
                    async (horizontal) => {
                        const result = await mockServer.getTool('set_cell_alignment').cb({ ref: 'A1', horizontal }, ctx);
                        assert.equal(result.structuredContent.horizontal, horizontal);
                    }
                ),
                { numRuns: 5 }
            );
        });
    });

    test('set_cell_border returns correct properties', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            const result = await mockServer.getTool('set_cell_border').cb({
                ref: 'A1', borderStyle: 'thin', sides: 'all'
            }, ctx);
            assert.equal(result.structuredContent.ref, 'A1');
            assert.equal(result.structuredContent.borderStyle, 'thin');
            assert.equal(result.structuredContent.sides, 'all');
        });
    });

    test('bold then set cell value preserves write', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('style-props');
            await mockServer.getTool('set_cell_bold').cb({ ref: 'E1', bold: true }, ctx);
            await mockServer.getTool('set_cell').cb({ ref: 'E1', value: 'bold text' }, ctx);
            const result = await mockServer.getTool('get_cell').cb({ ref: 'E1' }, ctx);
            assert.equal(result.structuredContent.value, 'bold text');
        });
    });

    }
