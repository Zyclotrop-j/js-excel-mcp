import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { ImageHandler } from '../../src/tools/handleImage.js';
import { run } from '../../src/util/requestContext.js';

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let imageHandler: ImageHandler;

export default function (test: any) {

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('image-test');

        imageHandler = new ImageHandler();
        imageHandler.server = mockServer as any;
        imageHandler.context = testContext;
        await imageHandler.register([]);

        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('image-test');
        await createTool.cb({ filename: 'image-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);
    });
});

test.after(async () => {
    if (!testContext) return;
    await (await testContext).cleanup();
});

test('insert_image with URL attempts to fetch (fails in no-network test environment)', async () => {
    await run(async () => {
        const tool = mockServer.getTool('insert_image');
        const ctx = createMockRequestContext('image-test');

        const result = await tool.cb({
            anchorCell: 'A1',
            imageUrl: 'https://example.com/test.png',
            widthPx: 100,
            heightPx: 100
        }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.length > 0);
        assert.ok(result.content[0].type === 'text');
        assert.ok(result.content[0].text.includes('failed to fetch image'));
    });
});

test('insert_image with no open workbook (different userId)', async () => {
    await run(async () => {
        const differentContext = createTestContext('image-test-no-wb');
        const differentImageHandler = new ImageHandler();
        const differentMockServer = new MockMcpServer();
        differentImageHandler.server = differentMockServer as any;
        differentImageHandler.context = differentContext;
        await differentImageHandler.register([]);

        const tool = differentMockServer.getTool('insert_image');
        const ctx = createMockRequestContext('image-test-no-wb');

        const result = await tool.cb({
            anchorCell: 'B2',
            imageUrl: 'https://example.com/test.png'
        }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.length > 0);
        assert.ok(result.content[0].type === 'text');
        assert.ok(result.content[0].text.includes('no workbook is currently open'));
        assert.ok(!result.structuredContent);

        await differentContext.cleanup();
    });
});

test('insert_image with invalid URL attempts fetch', async () => {
    await run(async () => {
        const tool = mockServer.getTool('insert_image');
        const ctx = createMockRequestContext('image-test');

        const result = await tool.cb({
            anchorCell: 'A1',
            imageUrl: 'not-a-valid-url'
        }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.length > 0);
        assert.ok(result.content[0].type === 'text');
        assert.ok(result.content[0].text.includes('failed to fetch image') ||
                  result.content[0].text.includes('could not find the image'));
    });
});

test('insert_image response structure when successful (schema check)', async () => {
    await run(async () => {
        const toolDefinition = mockServer.registeredTools.get('insert_image');
        assert.ok(toolDefinition);
        assert.ok(toolDefinition.outputSchema);

        const schemaShape = toolDefinition.outputSchema.shape;
        assert.ok(schemaShape);
        assert.ok(schemaShape.structuredContent);
        assert.equal(schemaShape.structuredContent.type.name, 'ZodOptional');
        assert.ok(schemaShape.structuredContent.type.schema);
    });
});

test('insert_image with imageUrl only (anchorCell is required via tool registration)', async () => {
    await run(async () => {
        const tool = mockServer.getTool('insert_image');
        const ctx = createMockRequestContext('image-test');

        const result = await tool.cb({
            anchorCell: 'A2',
            imageUrl: 'https://example.com/another.png'
        }, ctx);

        assert.ok(result.content);
        assert.ok(result.content.length > 0);
        assert.ok(result.content[0].type === 'text');
        assert.ok(result.content[0].text.includes('failed to fetch image'));
    });
});

}