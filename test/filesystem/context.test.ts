/**
 * Unit tests for Context.
 */
import test from 'baretest';
import { strict as assert } from 'node:assert';
import { Context } from '../../src/filesystem/context.js';
import { existsSync, unlinkSync } from 'node:fs';
import { createWorkbook, addWorksheet, sheetNames } from '@office-kit/xlsx/workbook';

const TEST_USER = 'context-unit-test';

function cleanup() {
    Context.contextCache.delete(TEST_USER);
    const dbPath = `data/${TEST_USER}.db`;
    try {
        if (existsSync(dbPath)) unlinkSync(dbPath);
    } catch { /* ignore */ }
}

test('Context', async () => {

    test('getContext returns same instance', async () => {
        cleanup();
        const ctx1 = Context.getContext(TEST_USER);
        const ctx2 = Context.getContext(TEST_USER);
        
        assert.strictEqual(ctx1, ctx2, 'Should return same instance');
        cleanup();
    });

    test('getContext returns different instances for different users', async () => {
        cleanup();
        const ctx1 = Context.getContext(TEST_USER);
        const ctx2 = Context.getContext(TEST_USER + '-other');
        
        assert.notStrictEqual(ctx1, ctx2, 'Should return different instances');
        
        // Cleanup
        Context.contextCache.delete(TEST_USER + '-other');
        try {
            const dbPath2 = `data/${TEST_USER}-other.db`;
            if (existsSync(dbPath2)) unlinkSync(dbPath2);
        } catch { /* ignore */ }
        cleanup();
    });

    test('setCurrentFile and getCurrentFile round-trip', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        await ctx.setCurrentFile('test.xlsx');
        const file = await ctx.getCurrentFile();
        
        assert.equal(file, 'test.xlsx');
        cleanup();
    });

    test('getCurrentFile returns null when not set', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        const file = await ctx.getCurrentFile();
        assert.equal(file, null);
        cleanup();
    });

    test('setCurrentSheet and getCurrentSheet round-trip', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        await ctx.setCurrentFile('test.xlsx');
        await ctx.setCurrentSheet('Sheet1');
        const sheet = await ctx.getCurrentSheet();
        
        assert.equal(sheet, 'Sheet1');
        cleanup();
    });

    test('getCurrentSheet is isolated per file', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        await ctx.setCurrentFile('file1.xlsx');
        await ctx.setCurrentSheet('Sheet1');
        
        await ctx.setCurrentFile('file2.xlsx');
        await ctx.setCurrentSheet('Sheet2');
        
        const sheet1 = await ctx.getCurrentSheet();
        assert.equal(sheet1, 'Sheet2', 'Should return sheet for current file');
        
        await ctx.setCurrentFile('file1.xlsx');
        const sheet1Again = await ctx.getCurrentSheet();
        assert.equal(sheet1Again, 'Sheet1', 'Should return sheet for file1');
        
        cleanup();
    });

    test('setCurrentCell and getCurrentCell round-trip', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        await ctx.setCurrentFile('test.xlsx');
        await ctx.setCurrentSheet('Sheet1');
        await ctx.setCurrentCell('A1');
        const cell = await ctx.getCurrentCell();
        
        assert.equal(cell, 'A1');
        cleanup();
    });

    test('getCurrentCell is isolated per sheet and file', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        await ctx.setCurrentFile('file1.xlsx');
        await ctx.setCurrentSheet('Sheet1');
        await ctx.setCurrentCell('A1');
        
        await ctx.setCurrentFile('file1.xlsx');
        await ctx.setCurrentSheet('Sheet2');
        await ctx.setCurrentCell('B2');
        
        const cell = await ctx.getCurrentCell();
        assert.equal(cell, 'B2', 'Should return cell for current sheet');
        
        await ctx.setCurrentSheet('Sheet1');
        const cell1 = await ctx.getCurrentCell();
        assert.equal(cell1, 'A1', 'Should return cell for Sheet1');
        
        cleanup();
    });

    test('getCurrentState returns context text and state', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        await ctx.setCurrentFile('test.xlsx');
        await ctx.setCurrentSheet('Sheet1');
        await ctx.setCurrentCell('A1');
        
        const [textBlock, stateRecord] = await ctx.getCurrentState();
        
        assert.equal(textBlock.type, 'text');
        assert.ok(textBlock.text.includes('test.xlsx'));
        assert.ok(textBlock.text.includes('Sheet1'));
        assert.ok(textBlock.text.includes('A1'));
        
        assert.equal(stateRecord.currentFile, 'test.xlsx');
        assert.equal(stateRecord.currentSheet, 'Sheet1');
        assert.equal(stateRecord.currentCell, 'A1');
        
        cleanup();
    });

    test('getCurrentState returns null for unset values', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        const [textBlock, stateRecord] = await ctx.getCurrentState();
        
        assert.equal(stateRecord.currentFile, null);
        assert.equal(stateRecord.currentSheet, null);
        assert.equal(stateRecord.currentCell, null);
        
        cleanup();
    });

    test('contextualiseResponse adds context to response', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        await ctx.setCurrentFile('test.xlsx');
        await ctx.setCurrentSheet('Sheet1');
        await ctx.setCurrentCell('A1');
        
        const result = await ctx.contextualiseResponse({
            content: [{ type: 'text', text: 'original content' }],
            structuredContent: { data: 'test' }
        });
        
        assert.equal(result.content.length, 2, 'Should have context + original content');
        assert.equal(result.content[1].type, 'text');
        assert.equal((result.content[1] as any).text, 'original content');
        
        const sc = result.structuredContent as any;
        assert.ok(sc.context, 'Should have context block');
        assert.equal(sc.context.currentFile, 'test.xlsx');
        assert.equal(sc.data, 'test', 'Should preserve existing structuredContent');
        
        cleanup();
    });

    test('contextualiseResponseTypes returns Zod schema', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        const schema = ctx.contextualiseResponseTypes();
        assert.ok(schema, 'Should return schema');
        
        // Test that schema validates
        const result = schema.safeParse({
            currentFile: 'test.xlsx',
            currentSheet: 'Sheet1',
            currentCell: 'A1'
        });
        assert.ok(result.success, 'Should validate correct input');
        
        cleanup();
    });

    test('delete removes workbook and related state', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        // Create workbook
        const wb = createWorkbook();
        await ctx.setWorkbook('test.xlsx', wb);
        await ctx.setCurrentFile('test.xlsx');
        await ctx.setCurrentSheet('Sheet1');
        await ctx.setCurrentCell('A1');
        
        // Delete workbook
        await ctx.delete('test.xlsx');
        
        const file = await ctx.getCurrentFile();
        const sheet = await ctx.getCurrentSheet();
        const cell = await ctx.getCurrentCell();
        
        assert.equal(file, null, 'currentFile should be cleared');
        assert.equal(sheet, null, 'currentSheet should be cleared');
        assert.equal(cell, null, 'currentCell should be cleared');
        
        cleanup();
    });

    test('getWorkbook and setWorkbook round-trip', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        const wb = createWorkbook();
        addWorksheet(wb, 'TestSheet');
        
        await ctx.setWorkbook('test.xlsx', wb);
        const loaded = await ctx.getWorkbook('test.xlsx');
        
        const names = sheetNames(loaded);
        assert.ok(names.includes('TestSheet'), 'Should load workbook with sheet');
        
        cleanup();
    });

    test('list returns all files', async () => {
        cleanup();
        const ctx = Context.getContext(TEST_USER);
        
        const wb = createWorkbook();
        await ctx.setWorkbook('file1.xlsx', wb);
        await ctx.setWorkbook('file2.xlsx', wb);
        
        const files = await ctx.list();
        assert.deepEqual(files.sort(), ['file1.xlsx', 'file2.xlsx']);
        
        cleanup();
    });
});

export default test;
