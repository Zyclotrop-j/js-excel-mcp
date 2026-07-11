import { CellDiscoveryHandler } from './src/tools/handleCells/discovery.js';
import { Context } from './src/filesystem/context.js';
import { getFreezePanes, getAutoFilter, listTables } from '@office-kit/xlsx/worksheet';
import * as fs from 'node:fs';

async function main() {
    const mockServer = { registerTool: () => {} };
    const mockMcpContext = { era: 'modern' as const, authInfo: { extra: { userId: 'public' } } };

    const handler = new CellDiscoveryHandler(mockServer as never, mockMcpContext as never, null as never);
    await handler.register([]);

    const bytes = fs.readFileSync('C:/Users/Janne/AppData/Local/Temp/opencode/discovery-test.xlsx');
    const context = Context.getContext('public');
    await context.set('discovery-test.xlsx', new Uint8Array(bytes));
    await context.setCurrentFile('discovery-test.xlsx');

    const sheets = ['Test1-Classic', 'Test2-TitleBlankHeaders', 'Test3-AllStrings', 'Test4-MixedTypeHdr'];

    for (const sheet of sheets) {
        await context.setCurrentSheet(sheet);
        const wb = await context.getWorkbook('discovery-test.xlsx');
        const ws = wb.sheets.find(s => s.sheet.title === sheet)?.sheet;
        if (!ws) continue;
        try { console.log(`${sheet}: freeze=${getFreezePanes(ws)}, autoFilter=${getAutoFilter(ws)?.ref ?? 'none'}, tables=${listTables(ws).length}`); } catch (e) { console.log(`${sheet}: structural check error: ${(e as Error).message}`); }
    }

    console.log('\n--- Running detect_headers (useSampling=false) ---');

    for (const sheet of sheets) {
        await context.setCurrentSheet(sheet);
        const tool = handler.getTool('detect_headers');
        if (!tool) { console.log('ERROR: not registered'); process.exit(1); }

        const result = await tool.cb(
            { sheet, scanDepth: 20, sampleWidth: 30, returnWidth: 30, useSampling: false },
            { mcpReq: {}, era: 'modern' }
        );

        const content = result.content?.[0];
        const text = content && 'text' in content ? content.text : '';
        console.log(`\n=== ${sheet} ===`);
        console.log(text);
    }
}

main().catch(e => { console.error(e); process.exit(1); });