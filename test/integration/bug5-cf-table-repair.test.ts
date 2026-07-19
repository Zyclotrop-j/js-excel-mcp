/**
 * BUG-5: corruption of Q4_Sales_Dashboard.xlsx — three regression tests.
 *
 * Findings came from inspecting the Excel repair log on an LLM-generated
 * workbook. Each test reproduces one defect by triggering the
 * save→load round-trip that Context.setWorkbook/getWorkbook performs on every
 * tool call, then re-loading the saved bytes and asserting the wire model
 * survived.
 *
 * Bug A — add_cell_value_rule innerXml round-trip loss:
 *   Operator + formulas were wrapped in a nested <cellIs> element passed as
 *   innerXml. The library's cfRule parser only preserves innerXml for
 *   VISUAL_RULE_TYPES (colorScale / dataBar / iconSet) — for cellIs it reads
 *   operator off <cfRule> and <formula> children of <cfRule> directly. The
 *   nested form was dropped on every round-trip, leaving empty cfRules that
 *   Excel discards as invalid (Removed Records: Conditional formatting).
 *
 * Bug B — add_cell_value_rule fillColor was silently ignored:
 *   The schema accepted fillColor but the handler never registered a dxf nor
 *   assigned dxfId, so no highlight was ever applied.
 *
 * Bug C — create_excel_table + add_autofilter on the same range:
 *   The generated sheet2 had both a sheet-level <autoFilter ref="A3:F9"/> and
 *   a table with ref="A3:F9". Excel's repair logic detects the conflict and
 *   discards the entire table (Removed Feature: Table).
 *
 * Bug D — self-referential formulas (circular references):
 *   The LLM wrote `=E14/D14-1` on cell E14 (the MoM-growth column referenced
 *   itself). Excel popped a circular-reference warning on open. The server
 *   can't know the caller's intent, so set_formula now runs a conservative
 *   self-reference detector and surfaces a non-fatal warning in the structured
 *   response (the write still goes through).
 */
import { strict as assert } from 'node:assert';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { createTestContext } from '../helpers/test-context.js';
import { ConditionalFormatHandler } from '../../src/tools/handleConditionalFormat.js';
import { TableHandler } from '../../src/tools/handleTable.js';
import { CellWriteHandler } from '../../src/tools/handleCells/write.js';
import { WorkbookTools } from '../../src/tools/handleWorkbook.js';
import { run } from '../../src/util/requestContext.js';
import { fromArrayBuffer, loadWorkbook } from '@office-kit/xlsx/io';
async function setup() {
    const mockServer = new MockMcpServer();
    let testContext;
    await run(async () => {
        testContext = await createTestContext('bug5-cf-table-test');
        for (const H of [ConditionalFormatHandler, TableHandler, CellWriteHandler, WorkbookTools]) {
            const h: any = new H();
            h.server = mockServer as any;
            h.context = testContext;
            if (H === WorkbookTools) {
                h.expressApp = { get: () => {}, post: () => {} } as any;
                h.serverOptions = { serverHost: 'http://localhost:3000' };
            }
            await h.register([]);
        }
        const ctx = createMockRequestContext('bug5-cf-table-test');
        await mockServer.getTool('create_new_workbook').cb({ filename: 'bug5.xlsx', createDefaultWorksheet: 'Sheet1' }, ctx);
    });
    return { mockServer, testContext };
}

async function reloadWorkbook(testContext: any, filename: string) {
    const bytes = await (await testContext).get(filename);
    return loadWorkbook(fromArrayBuffer(bytes));
}

export default function (test: any) {

    test('BUG-5A: cellIs rule survives a round-trip with operator and formula intact', async () => {
        const { mockServer, testContext } = await setup();
        try {
            await run(async () => {
                const ctx = createMockRequestContext('bug5-cf-table-test');
                await mockServer.getTool('set_cell').cb({ ref: 'A1', value: 100 }, ctx);
                await mockServer.getTool('set_cell').cb({ ref: 'A2', value: 50 }, ctx);
                await mockServer.getTool('add_cell_value_rule').cb({
                    range: 'A1:A2', operator: 'greaterThan', value: 60
                }, ctx);
                await mockServer.getTool('set_cell').cb({ ref: 'B1', value: 'force round-trip' }, ctx);

                const wb = await reloadWorkbook(testContext, 'bug5.xlsx');
                const sheet = wb.sheets.find((s: any) => s.sheet.title === 'Sheet1').sheet;
                assert.ok(sheet.conditionalFormatting.length >= 1, 'expected at least one CF entry');
                const rule = sheet.conditionalFormatting[sheet.conditionalFormatting.length - 1].rules[0];
                assert.equal(rule.type, 'cellIs');
                assert.equal(rule.operator, 'greaterThan');
                assert.deepEqual(rule.formulas, ['60']);
            });
        } finally {
            await (await testContext).cleanup();
        }
    });

    test('BUG-5A: between operator round-trips with both formulas', async () => {
        const { mockServer, testContext } = await setup();
        try {
            await run(async () => {
                const ctx = createMockRequestContext('bug5-cf-table-test');
                await mockServer.getTool('set_cell').cb({ ref: 'A1', value: 5 }, ctx);
                await mockServer.getTool('add_cell_value_rule').cb({
                    range: 'A1:A1', operator: 'between', value: 1, value2: 10
                }, ctx);
                await mockServer.getTool('set_cell').cb({ ref: 'B1', value: 'force round-trip' }, ctx);

                const wb = await reloadWorkbook(testContext, 'bug5.xlsx');
                const sheet = wb.sheets.find((s: any) => s.sheet.title === 'Sheet1').sheet;
                const rule = sheet.conditionalFormatting[sheet.conditionalFormatting.length - 1].rules[0];
                assert.equal(rule.operator, 'between');
                assert.deepEqual(rule.formulas, ['1', '10']);
            });
        } finally {
            await (await testContext).cleanup();
        }
    });

    test('BUG-5B: fillColor is wired through to a registered dxf with dxfId', async () => {
        const { mockServer, testContext } = await setup();
        try {
            await run(async () => {
                const ctx = createMockRequestContext('bug5-cf-table-test');
                await mockServer.getTool('set_cell').cb({ ref: 'A1', value: 100 }, ctx);
                await mockServer.getTool('add_cell_value_rule').cb({
                    range: 'A1:A1', operator: 'greaterThan', value: 50, fillColor: 'FFFF6B6B'
                }, ctx);
                await mockServer.getTool('set_cell').cb({ ref: 'B1', value: 'force round-trip' }, ctx);

                const wb = await reloadWorkbook(testContext, 'bug5.xlsx');
                const sheet = wb.sheets.find((s: any) => s.sheet.title === 'Sheet1').sheet;
                const rule = sheet.conditionalFormatting[sheet.conditionalFormatting.length - 1].rules[0];
                assert.equal(rule.operator, 'greaterThan');
                assert.equal(rule.formulas.length, 1);
                assert.ok(rule.dxfId !== undefined && rule.dxfId >= 0, 'rule should reference a dxf');
                const dxfs = (wb.styles as any).dxfs ?? [];
                assert.ok(dxfs.length > 0, 'stylesheet should have at least one dxf');
                const dxf = dxfs[rule.dxfId!];
                assert.ok(dxf && dxf.fill, 'dxf should have a fill');
                const fg = (dxf.fill as any).fgColor;
                assert.ok(fg, 'fill should have an fgColor');
            });
        } finally {
            await (await testContext).cleanup();
        }
    });

    test('BUG-5C: create_excel_table clears a matching sheet-level autoFilter', async () => {
        const { mockServer, testContext } = await setup();
        try {
            await run(async () => {
                const ctx = createMockRequestContext('bug5-cf-table-test');
                await mockServer.getTool('set_cells').cb({
                    range: 'A1:B2',
                    values: [['ColA', 'ColB'], ['a1', 'b1']]
                }, ctx);
                await mockServer.getTool('add_autofilter').cb({ range: 'A1:B2' }, ctx);

                const beforeWb = await reloadWorkbook(testContext, 'bug5.xlsx');
                const beforeSheet = beforeWb.sheets.find((s: any) => s.sheet.title === 'Sheet1').sheet;
                assert.ok(beforeSheet.autoFilter, 'precondition: autoFilter present before table creation');

                const result = await mockServer.getTool('create_excel_table').cb({
                    range: 'A1:B2', name: 'T', columns: ['ColA', 'ColB']
                }, ctx);
                assert.equal(result.structuredContent.action, 'created');
                assert.equal(result.structuredContent.clearedAutoFilter, true);

                await mockServer.getTool('set_cell').cb({ ref: 'D1', value: 'force round-trip' }, ctx);

                const wb = await reloadWorkbook(testContext, 'bug5.xlsx');
                const sheet = wb.sheets.find((s: any) => s.sheet.title === 'Sheet1').sheet;
                assert.ok(!sheet.autoFilter, 'sheet-level autoFilter should be cleared when it overlaps the table range');
                assert.equal(sheet.tables.length, 1);
                assert.equal(sheet.tables[0].ref, 'A1:B2');
                assert.equal(sheet.tables[0].displayName, 'T');
            });
        } finally {
            await (await testContext).cleanup();
        }
    });

    test('BUG-5C: create_excel_table leaves a non-overlapping sheet-level autoFilter alone', async () => {
        const { mockServer, testContext } = await setup();
        try {
            await run(async () => {
                const ctx = createMockRequestContext('bug5-cf-table-test');
                await mockServer.getTool('set_cells').cb({
                    range: 'A1:B2',
                    values: [['ColA', 'ColB'], ['a1', 'b1']]
                }, ctx);
                await mockServer.getTool('set_cells').cb({
                    range: 'D1:E2',
                    values: [['ColD', 'ColE'], ['d1', 'e1']]
                }, ctx);
                await mockServer.getTool('add_autofilter').cb({ range: 'D1:E2' }, ctx);

                const result = await mockServer.getTool('create_excel_table').cb({
                    range: 'A1:B2', name: 'T', columns: ['ColA', 'ColB']
                }, ctx);
                assert.equal(result.structuredContent.action, 'created');
                assert.equal(result.structuredContent.clearedAutoFilter, undefined);

                await mockServer.getTool('set_cell').cb({ ref: 'F1', value: 'force round-trip' }, ctx);

                const wb = await reloadWorkbook(testContext, 'bug5.xlsx');
                const sheet = wb.sheets.find((s: any) => s.sheet.title === 'Sheet1').sheet;
                assert.ok(sheet.autoFilter, 'non-overlapping sheet autoFilter should remain');
                assert.equal(sheet.autoFilter.ref, 'D1:E2');
                assert.equal(sheet.tables.length, 1);
            });
        } finally {
            await (await testContext).cleanup();
        }
    });

    test('BUG-5D: set_formula surfaces a non-fatal warning for a self-referential formula', async () => {
        const { mockServer, testContext } = await setup();
        try {
            await run(async () => {
                const ctx = createMockRequestContext('bug5-cf-table-test');
                await mockServer.getTool('set_cell').cb({ ref: 'D14', value: 100 }, ctx);
                await mockServer.getTool('set_cell').cb({ ref: 'C14', value: 80 }, ctx);

                const result = await mockServer.getTool('set_formula').cb({
                    ref: 'E14', formula: '=E14/D14-1'
                }, ctx);

                assert.equal(result.isError, undefined, 'self-reference must NOT block the write');
                assert.equal(result.structuredContent.ref, 'E14');
                assert.equal(result.structuredContent.formula, '=E14/D14-1');
                assert.ok(Array.isArray(result.structuredContent.warnings), 'warnings array should be present');
                assert.ok(result.structuredContent.warnings.length >= 1, 'at least one warning expected');
                assert.ok(result.structuredContent.warnings.some((w: string) => w.includes('E14')),
                    `warning should mention E14, got: ${JSON.stringify(result.structuredContent.warnings)}`);
                assert.ok(result.content.some((c: any) => c.type === 'text' && /warning/i.test(c.text)),
                    'text content should include the warning');
            });
        } finally {
            await (await testContext).cleanup();
        }
    });

    test('BUG-5D: set_formula produces no warning for a non-circular formula', async () => {
        const { mockServer, testContext } = await setup();
        try {
            await run(async () => {
                const ctx = createMockRequestContext('bug5-cf-table-test');
                await mockServer.getTool('set_cell').cb({ ref: 'C14', value: 80 }, ctx);
                await mockServer.getTool('set_cell').cb({ ref: 'D14', value: 100 }, ctx);

                const result = await mockServer.getTool('set_formula').cb({
                    ref: 'E14', formula: '=D14/C14-1'
                }, ctx);

                assert.equal(result.structuredContent.ref, 'E14');
                assert.equal(result.structuredContent.warnings, undefined,
                    'no warnings key for a clean formula');
                assert.ok(result.content.some((c: any) => c.type === 'text' && !/warning/i.test(c.text)));
            });
        } finally {
            await (await testContext).cleanup();
        }
    });
}
