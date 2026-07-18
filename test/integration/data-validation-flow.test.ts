import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { ValidationHandler } from '../../src/tools/handleValidation.js';
import { run } from '../../src/util/requestContext.js';

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;
let validationHandler: ValidationHandler;

export default function (test: any) {

test('setup', async () => {
    await run(async () => {
        mockServer = new MockMcpServer();
        testContext = createTestContext('data-validation-flow-test');

        validationHandler = new ValidationHandler();
        validationHandler.server = mockServer as any;
        validationHandler.context = testContext;
        await validationHandler.register([]);

        const workbookTools = await import('../../src/tools/handleWorkbook.js');
        const wbTools = new workbookTools.WorkbookTools();
        wbTools.server = mockServer as any;
        wbTools.context = testContext;
        wbTools.expressApp = { get: () => {}, post: () => {} } as any;
        wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
        await wbTools.register([]);

        const createTool = mockServer.getTool('create_new_workbook');
        const ctx = createMockRequestContext('data-validation-flow-test');
        await createTool.cb({ filename: 'validation-test.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);
    });
});

test.after(async () => {
    await (await testContext).cleanup();
});

test('add_dropdown_validation adds dropdown with string array options', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_dropdown_validation');
        const ctx = createMockRequestContext('data-validation-flow-test');

        const result = await tool.cb({
            range: 'A1:A10',
            options: ['Yes', 'No', 'Maybe']
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'A1:A10');
        assert.equal(result.structuredContent.optionsCount, 3);
    });
});

test('add_dropdown_validation adds dropdown with comma-separated string', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_dropdown_validation');
        const ctx = createMockRequestContext('data-validation-flow-test');

        const result = await tool.cb({
            range: 'B1:B10',
            options: 'Low,Medium,High'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'B1:B10');
        assert.equal(result.structuredContent.optionsCount, 3);
    });
});

test('add_dropdown_validation with prompt and error message', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_dropdown_validation');
        const ctx = createMockRequestContext('data-validation-flow-test');

        const result = await tool.cb({
            range: 'C1:C10',
            options: ['Option1', 'Option2'],
            prompt: 'Select an option',
            error: 'Please select a valid option'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'C1:C10');
        assert.equal(result.structuredContent.optionsCount, 2);
    });
});

test('add_number_validation adds decimal range validation', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_number_validation');
        const ctx = createMockRequestContext('data-validation-flow-test');

        const result = await tool.cb({
            range: 'D1:D10',
            min: 0,
            max: 100
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'D1:D10');
        assert.equal(result.structuredContent.type, 'decimal');
    });
});

test('add_number_validation adds whole number validation', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_number_validation');
        const ctx = createMockRequestContext('data-validation-flow-test');

        const result = await tool.cb({
            range: 'E1:E10',
            min: 1,
            max: 10,
            wholeNumber: true,
            errorTitle: 'Invalid',
            error: 'Must be a whole number between 1 and 10'
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'E1:E10');
        assert.equal(result.structuredContent.type, 'whole');
    });
});

test('add_number_validation adds validation without min or max', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_number_validation');
        const ctx = createMockRequestContext('data-validation-flow-test');

        const result = await tool.cb({
            range: 'F1:F10',
            wholeNumber: true
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'F1:F10');
        assert.equal(result.structuredContent.type, 'whole');
    });
});

test('add_dropdown_validation handles single option', async () => {
    await run(async () => {
        const tool = mockServer.getTool('add_dropdown_validation');
        const ctx = createMockRequestContext('data-validation-flow-test');

        const result = await tool.cb({
            range: 'G1:G10',
            options: ['OnlyOption']
        }, ctx);

        assert.ok(result.structuredContent);
        assert.equal(result.structuredContent.range, 'G1:G10');
        assert.equal(result.structuredContent.optionsCount, 1);
    });
});

}
