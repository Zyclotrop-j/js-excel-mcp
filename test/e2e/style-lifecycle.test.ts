/**
 * E2E tests for full style lifecycle.
 * Tests: create workbook → write cell → apply styles → verify.
 */
import baretest from 'baretest';
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { CellTools } from '../../src/tools/handleCell.js';
import { StyleHandler } from '../../src/tools/handleStyle.js';

const test = baretest('Style Lifecycle E2E');

let mockServer: MockMcpServer;
let testContext: ReturnType<typeof createTestContext>;

test('setup', async () => {
    mockServer = new MockMcpServer();
    testContext = createTestContext('style-lifecycle-e2e');

    const wbTools = new WorkbookTools();
    wbTools.server = mockServer as any;
    wbTools.context = testContext;
    wbTools.expressApp = { get: () => {}, post: () => {} } as any;
    wbTools.serverOptions = { serverHost: 'http://localhost:3000' };
    await wbTools.register([]);

    const cellTools = new CellTools();
    cellTools.server = mockServer as any;
    cellTools.context = testContext;
    await cellTools.register([]);

    const styleHandler = new StyleHandler();
    styleHandler.server = mockServer as any;
    styleHandler.context = testContext;
    await styleHandler.register([]);
});

test('teardown', async () => {
    await testContext.cleanup();
});

test('apply bold → verify structured content', async () => {
    const ctx = createMockRequestContext('style-lifecycle-e2e');

    await mockServer.getTool('create_new_workbook').cb({ filename: 'style-lifecycle.xlsx' }, ctx);
    await mockServer.getTool('set_cell').cb({ cell: 'A1', value: 'Bold Text' }, ctx);

    const boldResult = await mockServer.getTool('set_cell_bold').cb({ ref: 'A1', bold: true }, ctx);
    assert.equal(boldResult.structuredContent.ref, 'A1');
    assert.equal(boldResult.structuredContent.bold, true);

    const boldOffResult = await mockServer.getTool('set_cell_bold').cb({ ref: 'A1', bold: false }, ctx);
    assert.equal(boldOffResult.structuredContent.bold, false);
});

test('apply font properties', async () => {
    const ctx = createMockRequestContext('style-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ cell: 'B1', value: 'Styled Font' }, ctx);

    const fontResult = await mockServer.getTool('set_cell_font').cb({
        ref: 'B1',
        fontSize: 14,
        fontName: 'Arial',
        fontColor: 'FF0000FF'
    }, ctx);
    assert.equal(fontResult.structuredContent.ref, 'B1');
    assert.equal(fontResult.structuredContent.fontSize, 14);
    assert.equal(fontResult.structuredContent.fontName, 'Arial');
    assert.equal(fontResult.structuredContent.fontColor, 'FF0000FF');
});

test('apply background color', async () => {
    const ctx = createMockRequestContext('style-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ cell: 'C1', value: 'Colored Background' }, ctx);

    const bgResult = await mockServer.getTool('set_cell_background_color').cb({
        ref: 'C1',
        color: 'FFFFFF00'
    }, ctx);
    assert.equal(bgResult.structuredContent.ref, 'C1');
    assert.equal(bgResult.structuredContent.color, 'FFFFFF00');
});

test('apply alignment settings', async () => {
    const ctx = createMockRequestContext('style-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ cell: 'D1', value: 'Aligned Text' }, ctx);

    const alignResult = await mockServer.getTool('set_cell_alignment').cb({
        ref: 'D1',
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true
    }, ctx);
    assert.equal(alignResult.structuredContent.ref, 'D1');
    assert.equal(alignResult.structuredContent.horizontal, 'center');
    assert.equal(alignResult.structuredContent.vertical, 'middle');
    assert.equal(alignResult.structuredContent.wrapText, true);
});

test('apply border to cell', async () => {
    const ctx = createMockRequestContext('style-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ cell: 'E1', value: 'Bordered' }, ctx);

    const borderResult = await mockServer.getTool('set_cell_border').cb({
        ref: 'E1',
        borderStyle: 'thin',
        sides: 'all'
    }, ctx);
    assert.equal(borderResult.structuredContent.ref, 'E1');
    assert.equal(borderResult.structuredContent.borderStyle, 'thin');
    assert.equal(borderResult.structuredContent.sides, 'all');
});

test('chain multiple styles on one cell', async () => {
    const ctx = createMockRequestContext('style-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ cell: 'F1', value: 'Fully Styled' }, ctx);

    await mockServer.getTool('set_cell_bold').cb({ ref: 'F1', bold: true }, ctx);
    await mockServer.getTool('set_cell_font').cb({ ref: 'F1', fontSize: 18, fontName: 'Verdana' }, ctx);
    await mockServer.getTool('set_cell_background_color').cb({ ref: 'F1', color: 'FF000080' }, ctx);
    await mockServer.getTool('set_cell_alignment').cb({ ref: 'F1', horizontal: 'right', vertical: 'top' }, ctx);
    await mockServer.getTool('set_cell_border').cb({ ref: 'F1', borderStyle: 'thick', sides: 'all' }, ctx);

    const getResult = await mockServer.getTool('get_cell').cb({ cell: 'F1' }, ctx);
    assert.equal(getResult.structuredContent.value, 'Fully Styled');
});

test('style operations use current cell when no ref given', async () => {
    const ctx = createMockRequestContext('style-lifecycle-e2e');

    await mockServer.getTool('set_cell').cb({ cell: 'G1', value: 'Current Cell Style' }, ctx);
    await testContext.setCurrentCell('G1');

    const boldResult = await mockServer.getTool('set_cell_bold').cb({ bold: true }, ctx);
    assert.equal(boldResult.structuredContent.ref, 'G1');
    assert.equal(boldResult.structuredContent.bold, true);
});

export default function registerTests(testInstance: ReturnType<typeof baretest>) {
}
