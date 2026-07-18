/**
 * Integration tests for the cell-discovery tool surface registered in
 * src/tools/handleCells/discovery.ts (detect_headers / get_sample /
 * get_row_sample / get_column_sample).
 *
 * Pattern: drive the registered callbacks via MockMcpServer against an
 * isolated test context, mirroring test/property/cell-properties.test.ts.
 */
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { run, getContext } from '../../src/util/requestContext.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { CellDiscoveryHandler } from '../../src/tools/handleCells/discovery.js';
import { SheetHandler } from '../../src/tools/handleSheet.js';

export default function (test: any) {
    async function withContext(fn: (mockServer: MockMcpServer) => Promise<void>) {
        const mockServer = new MockMcpServer();
        const testContext = await createTestContext('discovery-it');
        const mockCtx = { authInfo: { extra: { userId: 'discovery-it' } } };

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

            const discovery = new CellDiscoveryHandler();
            discovery.server = mockServer as any;
            discovery.context = mockCtx as any;
            await discovery.register([]);

            const sheetHandler = new SheetHandler();
            sheetHandler.server = mockServer as any;
            sheetHandler.context = mockCtx as any;
            await sheetHandler.register([]);

            const ctx = createMockRequestContext('discovery-it');
            await mockServer.getTool('create_new_workbook').cb({ filename: 'discovery.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);

            await fn(mockServer);
        });

        await testContext.cleanup();
    }

    const HEADERS = ['Name', 'Age', 'City', 'Salary', 'Date', 'Active'];
    const DATA_ROWS: (string|number|boolean)[][] = [
        ['Tom',   30, 'Berlin', 50000, '2021-01-02', true],
        ['Lisa',  25, 'Paris',  48000, '2022-03-04', false],
        ['Ahmed', 41, 'Cairo',  72000, '2020-11-12', true],
        ['Sara',  37, 'Rome',   61000, '2023-05-21', true],
        ['Bob',   29, 'Lyon',   53000, '2019-08-09', false],
        ['Mona',  44, 'Tokyo',  99000, '2024-02-14', true],
        ['Ian',   22, 'Oslo',   40000, '2022-12-01', false],
        ['Nora',  33, 'Lagos',  67000, '2021-06-07', true],
        ['Omar',  28, 'Vienna', 59000, '2023-10-30', false]
    ];

    async function seedGrid(mockServer: MockMcpServer, ctx: any) {
        const values = [HEADERS, ...DATA_ROWS];
        await mockServer.getTool('set_cells').cb({ range: 'A1:F10', values }, ctx);
    }

    test('detect_headers with useSampling=false flags row 1 as the header band', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('discovery-it');
            await seedGrid(mockServer, ctx);

            const result = await mockServer.getTool('detect_headers').cb({ useSampling: false }, ctx);
            assert.equal(result.isError, undefined);
            assert.equal(result.structuredContent.hasHeaders, true);
            assert.equal(result.structuredContent.horizontalStart, 1);
            assert.equal(result.structuredContent.horizontalEnd, 1);
        });
    });

    test('get_sample with count=5 returns a structured grid summary', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('discovery-it');
            await seedGrid(mockServer, ctx);

            const result = await mockServer.getTool('get_sample').cb({ useSampling: false, count: 5 }, ctx);
            assert.equal(result.isError, undefined);
            const sc = result.structuredContent;
            assert.equal(sc.dataStartRow, 2);
            assert.equal(sc.dataStartCol, 1);
            assert.equal(sc.rows, 5);
            assert.equal(sc.cols, 5);
            assert.equal(sc.hasHeaders, true);
            assert.equal(sc.headerSource, 'heuristic');
            assert.ok(typeof sc.context === 'object');
        });
    });

    test('get_row_sample with count=5 returns a labeled row of length 5', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('discovery-it');
            await seedGrid(mockServer, ctx);

            const result = await mockServer.getTool('get_row_sample').cb({ useSampling: false, count: 5 }, ctx);
            assert.equal(result.isError, undefined);
            const sc = result.structuredContent;
            assert.equal(sc.row, 2);
            assert.equal(sc.columns, 5);
            assert.equal(sc.hasHeaders, true);
            assert.equal(sc.headerSource, 'heuristic');
            assert.ok(typeof sc.context === 'object');
        });
    });

    test('get_column_sample with count=5 returns a labeled column of length 5', async () => {
        await withContext(async (mockServer) => {
            const ctx = createMockRequestContext('discovery-it');
            await seedGrid(mockServer, ctx);

            const result = await mockServer.getTool('get_column_sample').cb({ useSampling: false, count: 5 }, ctx);
            assert.equal(result.isError, undefined);
            const sc = result.structuredContent;
            assert.equal(sc.column, 1);
            assert.equal(sc.rows, 5);
            assert.equal(sc.hasHeaders, true);
            assert.equal(sc.headerSource, 'heuristic');
            assert.ok(typeof sc.context === 'object');
        });
    });
}