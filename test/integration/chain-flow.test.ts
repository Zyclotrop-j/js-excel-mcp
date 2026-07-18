import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { ChainHandler } from '../../src/tools/handleChain.js';
import { run } from '../../src/util/requestContext.js';

const test = baretest('Chain Flow Integration Tests');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let chainHandler: ChainHandler;

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('chain-flow-test');

        chainHandler = new ChainHandler();
        chainHandler.server = mockServer as any;
        chainHandler.context = testContext;
        await chainHandler.register([]);

        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const cellRead = await import('../../src/tools/handleCells/read.js');
        const r = new cellRead.CellReadHandler();
        r.server = mockServer as any;
        r.context = testContext;
        await r.register([]);

        const cellWrite = await import('../../src/tools/handleCells/write.js');
        const w = new cellWrite.CellWriteHandler();
        w.server = mockServer as any;
        w.context = testContext;
        await w.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('chain-flow-test');
        await createTool.cb({ filename: 'chain-test.xlsx' }, ctx);
    });
});

test('teardown', async () => {
    const ctx = await testContext;
    await ctx.cleanup();
});

test('chain_operations writes multiple cells sequentially', async () => {
    await run(async () => {
        const tool = mockServer.getTool('chain_operations');
        const ctx = createMockRequestContext('chain-flow-test');

        const result = await tool.cb({
            operations: [
                { tool: 'set_cell', args: { cell: 'A1', value: 'First' }, label: 'write A1' },
                { tool: 'set_cell', args: { cell: 'B1', value: 'Second' }, label: 'write B1' },
                { tool: 'set_cell', args: { cell: 'C1', value: 'Third' }, label: 'write C1' }
            ]
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.total, 3);
        assert.equal(result.structuredContent.succeeded, 3);
        assert.equal(result.structuredContent.failed, 0);
        assert.equal(result.structuredContent.stoppedOnError, false);
        assert.ok(Array.isArray(result.structuredContent.results));
        assert.equal(result.structuredContent.results.length, 3);

        const r0 = result.structuredContent.results[0];
        assert.equal(r0.step, 0);
        assert.equal(r0.tool, 'set_cell');
        assert.equal(r0.status, 'ok');
        assert.equal(r0.label, 'write A1');

        const r1 = result.structuredContent.results[1];
        assert.equal(r1.step, 1);
        assert.equal(r1.tool, 'set_cell');
        assert.equal(r1.status, 'ok');

        const r2 = result.structuredContent.results[2];
        assert.equal(r2.step, 2);
        assert.equal(r2.tool, 'set_cell');
        assert.equal(r2.status, 'ok');

        const getTool = mockServer.getTool('get_cell');
        const a1 = await getTool.cb({ cell: 'A1' }, ctx);
        assert.equal(a1.structuredContent.value, 'First');
        const b1 = await getTool.cb({ cell: 'B1' }, ctx);
        assert.equal(b1.structuredContent.value, 'Second');
        const c1 = await getTool.cb({ cell: 'C1' }, ctx);
        assert.equal(c1.structuredContent.value, 'Third');
    });
});

test('chain_operations writes cells then reads them back in chain', async () => {
    await run(async () => {
        const tool = mockServer.getTool('chain_operations');
        const ctx = createMockRequestContext('chain-flow-test');

        const result = await tool.cb({
            operations: [
                { tool: 'set_cell', args: { cell: 'D1', value: 42 } },
                { tool: 'set_cell', args: { cell: 'E1', value: '=D1*2' } },
                { tool: 'get_cell', args: { cell: 'D1' } },
                { tool: 'get_cell', args: { cell: 'E1' } }
            ]
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.total, 4);
        assert.equal(result.structuredContent.succeeded, 4);
        assert.equal(result.structuredContent.failed, 0);

        const results = result.structuredContent.results;
        assert.equal(results[0].status, 'ok');
        assert.equal(results[1].status, 'ok');
        assert.equal(results[2].status, 'ok');
        assert.equal(results[3].status, 'ok');

        assert.ok(results[2].structuredContent);
        assert.equal(results[2].structuredContent.value, 42);
    });
});

test('chain_operations stops on error when stopOnError is true', async () => {
    await run(async () => {
        const tool = mockServer.getTool('chain_operations');
        const ctx = createMockRequestContext('chain-flow-test');

        const result = await tool.cb({
            operations: [
                { tool: 'set_cell', args: { cell: 'F1', value: 'ok' } },
                { tool: 'nonexistent_tool', args: {} },
                { tool: 'set_cell', args: { cell: 'G1', value: 'should not reach' } }
            ],
            stopOnError: true
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.total, 2);
        assert.equal(result.structuredContent.succeeded, 1);
        assert.equal(result.structuredContent.failed, 1);
        assert.equal(result.structuredContent.stoppedOnError, true);

        assert.equal(result.structuredContent.results[0].status, 'ok');
        assert.equal(result.structuredContent.results[1].status, 'not_found');
        assert.ok(result.structuredContent.results[1].error);
    });
});

test('chain_operations continues on error when stopOnError is false', async () => {
    await run(async () => {
        const tool = mockServer.getTool('chain_operations');
        const ctx = createMockRequestContext('chain-flow-test');

        const result = await tool.cb({
            operations: [
                { tool: 'set_cell', args: { cell: 'H1', value: 'ok' }, label: 'first ok' },
                { tool: 'nonexistent_tool', args: {} },
                { tool: 'set_cell', args: { cell: 'I1', value: 'still runs' }, label: 'third runs' }
            ],
            stopOnError: false
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.total, 3);
        assert.equal(result.structuredContent.succeeded, 2);
        assert.equal(result.structuredContent.failed, 1);
        assert.equal(result.structuredContent.stoppedOnError, false);

        const getTool = mockServer.getTool('get_cell');
        const i1 = await getTool.cb({ cell: 'I1' }, ctx);
        assert.equal(i1.structuredContent.value, 'still runs');
    });
});

export default function registerTests(testInstance: ReturnType<typeof baretest>) {
}
