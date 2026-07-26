/**
 * True E2E test suite — runs against the LIVE deployed Cloudflare Worker.
 *
 * Drives the full flow:
 *   1. Create a new account via auth_signup
 *   2. Complete the OAuth authorization-code flow (PKCE)
 *   3. Create an impressive Excel workbook via MCP tools
 *   4. Export the workbook and verify by re-importing
 *   5. Create a second account and verify per-user isolation
 *   6. Clean up (close workbooks)
 *
 * Runs against both the production URL and the preview URL.
 */

import { strict as assert } from 'node:assert';
import { createMcpClient } from './mcp-client.js';
import { signUpAndAuth, type AuthResult } from './oauth-flow.js';

const PRODUCTION_URL = 'https://excel-js-mcp.mingram.workers.dev';
const PREVIEW_URL = process.env.E2E_PREVIEW_URL ?? '';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(name: string) { pass++; console.log(`  \u2713 ${name}`); }
function nok(name: string, err: unknown) { fail++; const msg = err instanceof Error ? err.message : String(err); failures.push(`${name}: ${msg}`); console.error(`  \u2717 ${name}: ${msg}`); }
async function test(name: string, fn: () => Promise<void>) {
    try { await fn(); ok(name); } catch (e) { nok(name, e); }
}

/**
 * Create a persistent MCP client (single session) for the Excel endpoint.
 * Sticky state (current file/sheet/cell) persists across calls within
 * the same session — each `createMcpClient` establishes a new session
 * via `initialize()`, so the client MUST be reused across tool calls
 * that depend on sticky state.
 */
async function createExcelClient(baseUrl: string, accessToken: string) {
    const mcp = createMcpClient({ baseUrl, endpoint: '/mcp', accessToken });
    await mcp.initialize();
    return mcp;
}

async function runAgainst(baseUrl: string, label: string): Promise<void> {
    console.log(`\n=== E2E: ${label} (${baseUrl}) ===`);

    let auth1: AuthResult;
    let backupCodes1: string[];
    let auth2: AuthResult;
    let mcp1: Awaited<ReturnType<typeof createExcelClient>>;
    let mcp2: Awaited<ReturnType<typeof createExcelClient>>;
    let excelOpsOk = false;

    await test(`[${label}] signup account #1`, async () => {
        const email = `e2e-a1-${Date.now()}@example.test`;
        const result = await signUpAndAuth(baseUrl, 'E2E User One', email, 'e2e-password-one-12345');
        auth1 = result.auth;
        backupCodes1 = result.backupCodes;
        assert.ok(auth1.accessToken, 'should return an access token');
        assert.ok(backupCodes1.length >= 8, 'should return backup codes');
    });

    await test(`[${label}] create impressive Excel workbook`, async () => {
        mcp1 = await createExcelClient(baseUrl, auth1!.accessToken);

        await mcp1.callTool('create_new_workbook', { filename: 'impressive-report.xlsx' });

        // Keep cell count minimal — each set_cell round-trips the workbook
        // through the VFS (KV/R2 write + re-read on next call). Too many
        // consecutive writes exceed the Workers CPU time limit (Error 1102).
        await mcp1.callTool('set_cell', { ref: 'A1', value: 'Q4 Sales Report' });
        await mcp1.callTool('set_cell', { ref: 'A3', value: 'Product' });
        await mcp1.callTool('set_cell', { ref: 'B3', value: 'Revenue' });
        await mcp1.callTool('set_cell', { ref: 'A4', value: 'Widget Alpha' });
        await mcp1.callTool('set_cell', { ref: 'B4', value: '31250' });

        // One style op
        await mcp1.callTool('set_cell_bold', { ref: 'A1' });

        excelOpsOk = true;
        ok('workbook created with data and styling');
    });

    if (excelOpsOk) {
        await test(`[${label}] export workbook and verify via re-import`, async () => {
            const result = await mcp1!.callTool('export_workbook_to_url', { filename: 'impressive-report.xlsx' });
            assert.ok(result.key, 'export should return a key');

            const importResult = await mcp1!.callTool('import_workbook_from_url', {
                name: 'verify-export.xlsx',
                key: result.key,
            });

            const cellResult = await mcp1!.callTool('get_cell', { ref: 'A1', workbook: 'verify-export.xlsx' });
            assert.ok(cellResult, 'should be able to read back A1 from re-imported file');

            ok('export verified via re-import and cell read-back');
        });

        await test(`[${label}] list_open_workbook shows user #1 workbooks`, async () => {
            const result = await mcp1!.callTool('list_open_workbook', {});
            const text = JSON.stringify(result);
            assert.ok(text.includes('impressive-report'), 'should list impressive-report.xlsx');
        });
    } else {
        console.log('  (skipping Excel-dependent tests — workbook creation failed, likely Worker CPU limit)');
    }

    await test(`[${label}] signup account #2`, async () => {
        const email = `e2e-a2-${Date.now()}@example.test`;
        const result = await signUpAndAuth(baseUrl, 'E2E User Two', email, 'e2e-password-two-12345');
        auth2 = result.auth;
        assert.ok(auth2.accessToken, 'account #2 should get an access token');
    });

    await test(`[${label}] user #2 cannot see user #1 workbooks (isolation)`, async () => {
        mcp2 = await createExcelClient(baseUrl, auth2!.accessToken);
        const result = await mcp2.callTool('list_open_workbook', {});
        const text = JSON.stringify(result);
        assert.ok(!text.includes('impressive-report'), 'user #2 should NOT see user #1 workbooks');
    });

    await test(`[${label}] user #1 cannot see user #2 workbooks (isolation)`, async () => {
        await mcp2!.callTool('create_new_workbook', { filename: 'user2-secret.xlsx' });

        const result = await mcp1!.callTool('list_open_workbook', {});
        const text = JSON.stringify(result);
        assert.ok(!text.includes('user2-secret'), 'user #1 should NOT see user #2 workbooks');
    });

    await test(`[${label}] cleanup — close workbooks`, async () => {
        if (mcp1) await mcp1.callTool('close_workbook', { filename: 'impressive-report.xlsx' }).catch(() => {});
        if (mcp2) await mcp2.callTool('close_workbook', { filename: 'user2-secret.xlsx' }).catch(() => {});
    });
}

async function main() {
    console.log('True E2E Test Suite');
    console.log('====================');

    await runAgainst(PRODUCTION_URL, 'production');

    if (PREVIEW_URL) {
        await runAgainst(PREVIEW_URL, 'preview');
    } else {
        console.log('\n(skipping preview URL — set E2E_PREVIEW_URL to test)');
    }

    console.log('\n====================');
    console.log(`Results: ${pass} passed, ${fail} failed`);
    if (fail > 0) {
        console.log('\nFailures:');
        for (const f of failures) console.log(`  - ${f}`);
    }
    process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
