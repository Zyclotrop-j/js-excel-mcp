import type { CallToolResult } from '@modelcontextprotocol/server';
import { strict as assert } from 'node:assert';

/**
 * Assert that a tool result has the expected context state.
 */
export function assertContextUpdated(
    result: CallToolResult,
    expected: { currentFile?: string | null; currentSheet?: string | null; currentCell?: string | null }
): void {
    const sc = (result as any).structuredContent;
    assert.ok(sc, 'Result missing structuredContent');
    assert.ok(sc.context, 'Result missing context block');

    if (expected.currentFile !== undefined) {
        assert.equal(sc.context.currentFile, expected.currentFile,
            `Expected currentFile=${expected.currentFile}, got ${sc.context.currentFile}`);
    }
    if (expected.currentSheet !== undefined) {
        assert.equal(sc.context.currentSheet, expected.currentSheet,
            `Expected currentSheet=${expected.currentSheet}, got ${sc.context.currentSheet}`);
    }
    if (expected.currentCell !== undefined) {
        assert.equal(sc.context.currentCell, expected.currentCell,
            `Expected currentCell=${expected.currentCell}, got ${sc.context.currentCell}`);
    }
}

/**
 * Assert that a tool result contains an error message.
 */
export function assertToolError(result: CallToolResult, expectedMessage: string): void {
    const textContent = result.content.find((c: any) => c.type === 'text');
    assert.ok(textContent, 'Result missing text content');
    assert.ok(
        (textContent as any).text.includes(expectedMessage),
        `Expected error to include '${expectedMessage}', got '${(textContent as any).text}'`
    );
}

/**
 * Assert that a tool result succeeded (has structuredContent with expected fields).
 */
export function assertToolSuccess(result: CallToolResult): void {
    const sc = (result as any).structuredContent;
    assert.ok(sc, 'Tool call did not return structuredContent');
}
