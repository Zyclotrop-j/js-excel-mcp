/**
 * BUG-3: set_rich_text parts deserialization error.
 *
 * Symptom: "makeTextRun: text must be a string" when calling set_rich_text.
 * Root cause: makeRichText() returns a frozen array of TextRun objects, but the
 * serializer expects a RichTextValue with { kind: 'rich-text', runs: [...] }.
 *
 * Tests verify schema validation and callback behavior for parts array.
 */
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { RichTextHandler } from '../../src/tools/handleRichText.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { run } from '../../src/util/requestContext.js';
import z from 'zod';

async function setupBug3() {
    const mockServer = new MockMcpServer();
    let testContext;

    await run(async () => {
        testContext = await createTestContext('bug3-richtext-test');
        const richTextHandler = new RichTextHandler();
        richTextHandler.server = mockServer as any;
        richTextHandler.context = testContext;
        await richTextHandler.register([]);

        const wbTools = new WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const ctx = createMockRequestContext('bug3-richtext-test');
        await mockServer.getTool('create_new_workbook').cb({ filename: 'bug3-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);
    });

    return { mockServer, testContext };
}

export default function (test: any) {

test('BUG-3: schema rejects parts with missing text property', async () => {
    const { mockServer, testContext } = await setupBug3();
    try {
        const tool = mockServer.getTool('set_rich_text');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse({
            ref: 'A1',
            parts: [
                { bold: true, fontSize: 14 },
                { text: 'valid part' }
            ]
        });

        assert.equal(result.success, false, 'Part without text property should fail schema validation');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-3: schema rejects parts with non-string text', async () => {
    const { mockServer, testContext } = await setupBug3();
    try {
        const tool = mockServer.getTool('set_rich_text');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse({
            ref: 'A1',
            parts: [
                { text: 123 },
                { text: 'valid' }
            ]
        });

        assert.equal(result.success, false, 'Part with numeric text should fail schema validation');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-3: schema rejects parts with null text', async () => {
    const { mockServer, testContext } = await setupBug3();
    try {
        const tool = mockServer.getTool('set_rich_text');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse({
            ref: 'A1',
            parts: [
                { text: null }
            ]
        });

        assert.equal(result.success, false, 'Part with null text should fail schema validation');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-3: schema accepts empty parts array', async () => {
    const { mockServer, testContext } = await setupBug3();
    try {
        const tool = mockServer.getTool('set_rich_text');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse({
            ref: 'A1',
            parts: []
        });

        assert.equal(result.success, true, 'Empty parts array should pass schema validation (z.array allows empty)');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-3: schema accepts valid parts with all optional fields', async () => {
    const { mockServer, testContext } = await setupBug3();
    try {
        const tool = mockServer.getTool('set_rich_text');
        const schema = tool.inputSchema as z.ZodType<any>;

        const result = schema.safeParse({
            ref: 'A1',
            parts: [
                { text: 'Bold title', bold: true, fontSize: 16, fontColor: 'FF0000', fontName: 'Arial' },
                { text: ' Normal text', italic: true, underline: false }
            ]
        });

        assert.equal(result.success, true, 'Valid parts with all optional fields should pass');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-3: simulates MCP deserialization bug — parts arrive as JSON strings', async () => {
    const { mockServer, testContext } = await setupBug3();
    try {
        const tool = mockServer.getTool('set_rich_text');
        const schema = tool.inputSchema as z.ZodType<any>;

        const malformedInput = {
            ref: 'A1',
            parts: '[{"text":"Bold","bold":true},{"text":"Normal"}]'
        };

        const result = schema.safeParse(malformedInput);
        assert.equal(result.success, false, 'Stringified parts should fail schema validation');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-3: simulates deserialization bug — parts items are arrays instead of objects', async () => {
    const { mockServer, testContext } = await setupBug3();
    try {
        const tool = mockServer.getTool('set_rich_text');
        const schema = tool.inputSchema as z.ZodType<any>;

        const malformedInput = {
            ref: 'A1',
            parts: [['Bold', true], ['Normal', false]]
        };

        const result = schema.safeParse(malformedInput);
        assert.equal(result.success, false, 'Array-format parts should fail schema validation');
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-3: tool callback succeeds with valid parts (happy path)', async () => {
    const { mockServer, testContext } = await setupBug3();
    try {
        await run(async () => {
            const ctx = createMockRequestContext('bug3-richtext-test');
            const tool = mockServer.getTool('set_rich_text');

            const result = await tool.cb({
                ref: 'A1',
                parts: [
                    { text: 'Hello ', bold: true, fontSize: 14 },
                    { text: 'World', italic: true }
                ]
            }, ctx);

            assert.ok(result.structuredContent);
            assert.equal(result.structuredContent.ref, 'A1');
            assert.equal(result.structuredContent.runCount, 2);
        });
    } finally {
        await (await testContext).cleanup();
    }
});

test('BUG-3: tool callback succeeds with single part', async () => {
    const { mockServer, testContext } = await setupBug3();
    try {
        await run(async () => {
            const ctx = createMockRequestContext('bug3-richtext-test');
            const tool = mockServer.getTool('set_rich_text');

            const result = await tool.cb({
                ref: 'B1',
                parts: [
                    { text: 'Single run', bold: true }
                ]
            }, ctx);

            assert.ok(result.structuredContent);
            assert.equal(result.structuredContent.ref, 'B1');
            assert.equal(result.structuredContent.runCount, 1);
        });
    } finally {
        await (await testContext).cleanup();
    }
});

}
