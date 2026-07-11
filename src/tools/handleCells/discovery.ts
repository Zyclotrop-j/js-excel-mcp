import { ToolHandler } from '../interface.js';
import { getCell, getMaxRow, getMaxCol, getFreezePanes, getAutoFilter, listTables, type Worksheet } from '@office-kit/xlsx/worksheet';
import { cellValueAsString } from '@office-kit/xlsx/cell';
import { getCellFont, getCellFill, getCellBorder } from '@office-kit/xlsx/styles';
import type { Workbook, SheetRef } from '@office-kit/xlsx/workbook';
import { coordinateToTuple, rangeBoundaries } from '@office-kit/xlsx/utils';
import { encode } from '@toon-format/toon';
import z from 'zod';
import { createHash } from 'node:crypto';
import { Context } from '../../filesystem/context.js';
import { inputRequired, isInputRequiredResult, type InputRequiredResult } from '@modelcontextprotocol/server';

type SamplingContentBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; name: string; id: string; input: Record<string, unknown> }
    | { type: 'image'; data: string; mimeType: string }
    | { type: 'audio'; data: string; mimeType: string };

type SamplingResponse = {
    content: SamplingContentBlock | SamplingContentBlock[];
};

type SamplingParams = {
    messages: { role: 'user' | 'assistant'; content: { type: 'text'; text: string } }[];
    tools?: unknown[];
    toolChoice?: { mode?: 'required' | 'auto' | 'none' };
    maxTokens?: number;
};

type SamplingCtx = {
    era: 'legacy' | 'modern';
    requestSampling?: (params: SamplingParams) => Promise<SamplingResponse>;
    inputResponses?: Record<string, unknown>;
};

type CacheStore = {
    remember(key: string, value: string): Promise<void>;
    recall(key: string): Promise<string | null>;
};

type Band = { start: number; end: number; values: string[][] };

type RowProfile = {
    idx: number;
    strCount: number;
    totalCount: number;
    boldCount: number;
    filledCount: number;
    borderedCount: number;
};

type DetectBandsResult = {
    horizontal: Band | null;
    vertical: Band | null;
    maxRow: number;
    maxCol: number;
    source: 'heuristic' | 'sampling' | 'manual';
    explanation: string | null;
};

type DetectBandsOpts = {
    scanDepth?: number;
    sampleWidth?: number;
    returnWidth?: number;
    useSampling?: boolean;
    headerStartRow?: number;
    headerRows?: number;
    headerStartCol?: number;
    headerCols?: number;
    cache?: CacheStore;
    cacheFilename?: string;
    cacheSheet?: string;
};

const TOOL_NAME = 'record_headers';
const SAMPLE_KEY = 'bands';

const headerDetectionSchema = z.object({
    horizontalStartRow: z.number(),
    horizontalEndRow: z.number(),
    verticalStartCol: z.number(),
    verticalEndCol: z.number(),
    explanation: z.string()
});

const headerDetectionJsonSchema = {
    type: 'object' as const,
    properties: {
        horizontalStartRow: { type: 'number', description: '1-based index of the FIRST horizontal header row; 0 if no horizontal headers' },
        horizontalEndRow: { type: 'number', description: '1-based index of the LAST horizontal header row; 0 if no horizontal headers' },
        verticalStartCol: { type: 'number', description: '1-based index of the FIRST vertical header column; 0 if no vertical headers' },
        verticalEndCol: { type: 'number', description: '1-based index of the LAST vertical header column; 0 if no vertical headers' },
        explanation: { type: 'string', description: 'One short sentence explaining the decision' }
    },
    required: ['horizontalStartRow', 'horizontalEndRow', 'verticalStartCol', 'verticalEndCol', 'explanation']
};

const computeRowProfile = (
    wb: Workbook,
    ws: Worksheet,
    axis: 'row' | 'col',
    idx: number,
    span: number
): RowProfile => {
    let strCount = 0;
    let totalCount = 0;
    let boldCount = 0;
    let filledCount = 0;
    let borderedCount = 0;
    for (let j = 1; j <= span; j++) {
        const cell = axis === 'row' ? getCell(ws, idx, j) : getCell(ws, j, idx);
        if (!cell) continue;
        const v = cell.value;
        if (v === null || v === undefined) continue;
        if (typeof v === 'string') strCount++;
        totalCount++;

        let font: { bold?: boolean } | undefined;
        let fill: { kind?: string; patternType?: string } | undefined;
        let border: { bottom?: { style?: string } } | undefined;
        try { font = getCellFont(wb, cell); } catch { /* */ }
        try { fill = getCellFill(wb, cell); } catch { /* */ }
        try { border = getCellBorder(wb, cell); } catch { /* */ }

        if (font && font.bold === true) boldCount++;
        if (fill && fill.kind === 'pattern' && fill.patternType === 'solid') filledCount++;
        if (border && border.bottom && border.bottom.style !== undefined) borderedCount++;
    }
    return { idx, strCount, totalCount, boldCount, filledCount, borderedCount };
};

const isHeaderLikeBy = (p: RowProfile, dataRows: RowProfile[]): boolean => {
    if (p.totalCount === 0) return false;
    if (dataRows.length === 0) return false;
    const maxDataTotal = Math.max(...dataRows.map(d => d.totalCount));
    const densityThreshold = Math.max(2, Math.floor(maxDataTotal * 0.5));
    if (p.totalCount < densityThreshold) return false;
    if (p.strCount === p.totalCount && p.totalCount > 0 &&
        dataRows.some(d => d.strCount < d.totalCount)) return true;
    if (p.boldCount > 0 && p.boldCount === p.totalCount &&
        dataRows.every(d => d.boldCount === 0)) return true;
    if (p.filledCount > 0 && p.filledCount === p.totalCount &&
        dataRows.every(d => d.filledCount === 0)) return true;
    if (p.borderedCount > 0 && p.borderedCount === p.totalCount &&
        dataRows.every(d => d.borderedCount === 0)) return true;
    return false;
};

const heuristicBands = (
    ws: Worksheet,
    wb: Workbook,
    scanDepth: number,
    sampleWidth: number
): { horizontalStart: number; horizontalEnd: number; verticalStart: number; verticalEnd: number; maxRow: number; maxCol: number; reason: string } => {
    const maxRow = getMaxRow(ws);
    const maxCol = getMaxCol(ws);

    let horizontalStart = 0;
    let horizontalEnd = 0;
    let verticalStart = 0;
    let verticalEnd = 0;
    let reason = 'no headers detected';

    // --- Phase 1: Structural signals (definitive) ---
    // Excel Tables — explicit headerRowCount
    let done = false;
    for (const table of listTables(ws)) {
        if (!table.ref) continue;
        try {
            const bounds = rangeBoundaries(table.ref);
            const hc = table.headerRowCount ?? 1;
            if (hc <= 0) continue;
            horizontalStart = bounds.minRow;
            horizontalEnd = bounds.minRow + hc - 1;
            reason = `structural: table '${table.displayName}' header range ${table.ref}`;
            done = true;
            break;
        } catch { /* */ }
    }

    // AutoFilter — first row of ref is header
    if (!done) {
        try {
            const af = getAutoFilter(ws);
            if (af?.ref) {
                const bounds = rangeBoundaries(af.ref);
                horizontalStart = bounds.minRow;
                horizontalEnd = bounds.minRow;
                reason = `structural: autoFilter ref ${af.ref}`;
                done = true;
            }
        } catch { /* */ }
    }

    // Freeze panes — frozen rows/cols are headers (strong signal, fallback for horizontal)
    let frozenRows = 0;
    let frozenCols = 0;
    try {
        const freezeRef = getFreezePanes(ws);
        if (freezeRef) {
            const { row, col } = coordinateToTuple(freezeRef);
            frozenRows = Math.max(0, row - 1);
            frozenCols = Math.max(0, col - 1);
        }
    } catch { /* */ }

    if (!done && frozenRows > 0) {
        horizontalStart = 1;
        horizontalEnd = frozenRows;
        reason = `structural: freeze panes (${frozenRows} frozen rows)`;
        done = true;
    }

    if (frozenCols > 0) {
        verticalStart = 1;
        verticalEnd = frozenCols;
        reason = `structural: freeze panes (${frozenCols} frozen cols)`;
    }

    // --- Phase 2: Formatting + type-pattern detection ---
    const detectByPattern = (axis: 'row' | 'col'): { start: number; end: number; reason: string } | null => {
        const limit = Math.min(axis === 'row' ? maxRow : maxCol, scanDepth);
        const span = Math.min(axis === 'row' ? maxCol : maxRow, sampleWidth);

        const profiles: RowProfile[] = [];
        for (let idx = 1; idx <= limit; idx++) {
            profiles.push(computeRowProfile(wb, ws, axis, idx, span));
        }

        const populated = profiles.filter(p => p.totalCount > 0);
        if (populated.length < 2) return null;

        const dataCount = Math.min(4, Math.max(1, Math.floor(populated.length / 3)));

        let hStart = 0;
        let hEnd = 0;
        for (let i = 0; i < populated.length; i++) {
            const p = populated[i];
            const dataRows = populated.slice(i + 1, i + 1 + dataCount);
            if (dataRows.length === 0) {
                if (hStart > 0) break;
                continue;
            }
            if (isHeaderLikeBy(p, dataRows)) {
                if (hStart === 0) hStart = p.idx;
                hEnd = p.idx;
            } else if (hStart > 0) {
                break;
            }
        }

        if (hStart === 0) return null;

        const firstHeader = populated.find(p => p.idx === hStart);
        let signal = 'type-pattern contrast';
        if (firstHeader) {
            if (firstHeader.boldCount === firstHeader.totalCount) signal = 'bold formatting contrast';
            else if (firstHeader.filledCount === firstHeader.totalCount) signal = 'fill formatting contrast';
            else if (firstHeader.borderedCount === firstHeader.totalCount) signal = 'border formatting contrast';
        }
        return { start: hStart, end: hEnd, reason: `heuristic: ${signal} detected header rows ${hStart}-${hEnd}` };
    };

    if (horizontalStart === 0) {
        const result = detectByPattern('row');
        if (result) {
            horizontalStart = result.start;
            horizontalEnd = result.end;
            reason = result.reason;
        }
    }

    if (verticalStart === 0) {
        // Vertical axis: type-pattern contrast is too noisy for columns
        // (e.g. a "Name" column is all-strings while "Age" has numbers —
        // that's a data column, not a row label). Only structural signals
        // (freeze panes above) are reliable for vertical headers.
        // The LLM path handles vertical header detection with semantic understanding.
    }

    if (horizontalStart === 0 && verticalStart === 0) {
        reason = `heuristic: no header-like rows in first ${scanDepth} scanned rows/cols`;
    }

    return { horizontalStart, horizontalEnd, verticalStart, verticalEnd, maxRow, maxCol, reason };
};

const collectSample = (
    ws: Worksheet,
    axis: 'row' | 'col',
    limit: number,
    span: number
): string[][] => {
    const maxAcross = axis === 'row' ? getMaxCol(ws) : getMaxRow(ws);
    const maxCount = Math.min(span, maxAcross);
    const out: string[][] = [];
    for (let i = 1; i <= limit; i++) {
        const sample: string[] = [];
        for (let j = 1; j <= maxCount; j++) {
            const cell = axis === 'row' ? getCell(ws, i, j) : getCell(ws, j, i);
            sample.push(cell ? cellValueAsString(cell.value) : '');
        }
        out.push(sample);
    }
    return out;
};

const buildSamplingParams = (rowSamples: string[][], columnSamples: string[][]): SamplingParams => {
    const prompt = [
        'You are a data analyst reviewing the start of an Excel-style worksheet.',
        '',
        'Below are samples of the first rows and first columns. Values are encoded in TOON format (a compact array notation).',
        '',
        'Row samples (first N rows, each is a TOON array of cell values):',
        rowSamples.map((v, i) => `Row ${i + 1}: ${encode(v)}`).join('\n'),
        '',
        'Column samples (first N columns, each is a TOON array of cell values):',
        columnSamples.map((v, i) => `Column ${i + 1}: ${encode(v)}`).join('\n'),
        '',
        'Identify header bands:',
        '  - HORIZONTAL HEADER rows: rows whose cells are FIELD NAMES (e.g. "name", "age", "date", "revenue", "status", "category", "id", "score", "department", "year", "month", "price", "quantity", "total", "region"). These sit ABOVE the data.',
        '    Report the FIRST (`horizontalStartRow`) and LAST (`horizontalEndRow`) row indices.',
        '    If row 1 is a title like "Quarterly Report" and row 3 contains column names like "Name", "Age", then horizontalStartRow=3, horizontalEndRow=3.',
        '  - VERTICAL HEADER columns: columns whose cells are ROW LABELS. These sit to the LEFT of the data.',
        '    Report the FIRST (`verticalStartCol`) and LAST (`verticalEndCol`) column indices.',
        'A row of plain values (e.g. a person name + a string department) is DATA, not a header, even if every cell is a string.',
        '',
        `Call the ${TOOL_NAME} tool. Use 0 for both start and end on an axis if there are no headers there.`,
        ''
    ].join('\n');

    return {
        messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        tools: [{
            name: TOOL_NAME,
            description: 'Record which rows and columns are field-label headers versus data',
            inputSchema: headerDetectionJsonSchema
        }],
        toolChoice: { mode: 'required' },
        maxTokens: 400
    };
};

const extractStructured = (
    response: SamplingResponse
): { horizontalStart: number; horizontalEnd: number; verticalStart: number; verticalEnd: number; explanation: string } | null => {
    const blocks = Array.isArray(response.content) ? response.content : [response.content];
    for (const block of blocks) {
        if (block.type === 'tool_use' && block.name === TOOL_NAME) {
            const parsed = headerDetectionSchema.safeParse(block.input);
            if (parsed.success) {
                const d = parsed.data;
                let hEnd = Math.max(0, Math.floor(d.horizontalEndRow || 0));
                let hStart = Math.max(0, Math.floor(d.horizontalStartRow || 0));
                let vEnd = Math.max(0, Math.floor(d.verticalEndCol || 0));
                let vStart = Math.max(0, Math.floor(d.verticalStartCol || 0));
                if (hEnd === 0) hStart = 0;
                if (vEnd === 0) vStart = 0;
                if (hEnd > 0 && hStart > hEnd) hStart = hEnd;
                if (vEnd > 0 && vStart > vEnd) vStart = vEnd;
                return { horizontalStart: hStart, horizontalEnd: hEnd, verticalStart: vStart, verticalEnd: vEnd, explanation: d.explanation };
            }
        }
    }
    return null;
};

const sampleToLLM = async (
    ctx: SamplingCtx,
    rowSamples: string[][],
    columnSamples: string[][]
): Promise<{ horizontalStart: number; horizontalEnd: number; verticalStart: number; verticalEnd: number; explanation: string } | InputRequiredResult | null> => {
    const params = buildSamplingParams(rowSamples, columnSamples);

    if (ctx.era === 'modern') {
        const response = ctx.inputResponses?.[SAMPLE_KEY] as SamplingResponse | undefined;
        if (!response) {
            return inputRequired({
                inputRequests: { [SAMPLE_KEY]: inputRequired.createMessage(params as never) }
            });
        }
        return extractStructured(response);
    }

    const fn = ctx.requestSampling;
    if (typeof fn !== 'function') return null;
    try {
        const response = await fn(params);
        return extractStructured(response);
    } catch {
        return null;
    }
};

const buildBand = (
    ws: Worksheet,
    axis: 'row' | 'col',
    start: number,
    end: number,
    returnWidth: number
): Band | null => {
    if (end <= 0 || start <= 0 || start > end) return null;
    const maxRow = getMaxRow(ws);
    const maxCol = getMaxCol(ws);
    const span = Math.min(axis === 'row' ? maxCol : maxRow, returnWidth);
    const clampedStart = Math.max(1, Math.min(start, axis === 'row' ? maxRow : maxCol));
    const clampedEnd = Math.min(end, axis === 'row' ? maxRow : maxCol);
    if (clampedStart > clampedEnd) return null;
    const values: string[][] = [];
    const cellValueAt = (a: number, b: number): string => {
        const cell = axis === 'row' ? getCell(ws, a, b) : getCell(ws, b, a);
        return cell ? cellValueAsString(cell.value) : '';
    };
    for (let i = clampedStart; i <= clampedEnd; i++) {
        const row: string[] = [];
        for (let j = 1; j <= span; j++) row.push(cellValueAt(i, j));
        values.push(row);
    }
    return { start: clampedStart, end: clampedEnd, values };
};

const computeFingerprint = (ws: Worksheet, scanDepth: number, sampleWidth: number): string => {
    const maxR = Math.max(scanDepth, sampleWidth);
    const maxC = Math.max(scanDepth, sampleWidth);
    const limitRow = Math.min(getMaxRow(ws), maxR);
    const limitCol = Math.min(getMaxCol(ws), maxC);
    const parts: string[] = [];
    for (let r = 1; r <= limitRow; r++) {
        for (let c = 1; c <= limitCol; c++) {
            const cell = getCell(ws, r, c);
            if (cell) parts.push(`${r}:${c}:${cellValueAsString(cell.value)}:${cell.styleId}`);
        }
    }
    let freezeRef = '';
    let afRef = '';
    let tableRefs = '';
    try { freezeRef = getFreezePanes(ws) ?? ''; } catch { /* */ }
    try { afRef = getAutoFilter(ws)?.ref ?? ''; } catch { /* */ }
    try {
        const ts = listTables(ws);
        if (ts.length) tableRefs = ts.map((t: { ref?: string }) => t.ref ?? '').join('|');
    } catch { /* */ }
    parts.push(`freeze:${freezeRef}|af:${afRef}|tables:${tableRefs}`);
    return createHash('md5').update(parts.join('\0')).digest('hex');
};

const detectBands = async (
    ws: Worksheet,
    wb: Workbook,
    ctx: SamplingCtx,
    opts: DetectBandsOpts
): Promise<DetectBandsResult | InputRequiredResult> => {
    const scanDepth = opts.scanDepth ?? 20;
    const sampleWidth = opts.sampleWidth ?? 30;
    const returnWidth = opts.returnWidth ?? 30;
    const useSampling = opts.useSampling ?? true;
    const maxRow = getMaxRow(ws);
    const maxCol = getMaxCol(ws);

    if (opts.headerRows !== undefined || opts.headerCols !== undefined) {
        const hStart = opts.headerStartRow ?? 1;
        const hCount = opts.headerRows ?? 0;
        const vStart = opts.headerStartCol ?? 1;
        const vCount = opts.headerCols ?? 0;
        const horizontal = hCount > 0 ? buildBand(ws, 'row', hStart, hStart + hCount - 1, returnWidth) : null;
        const vertical = vCount > 0 ? buildBand(ws, 'col', vStart, vStart + vCount - 1, returnWidth) : null;
        return { horizontal, vertical, maxRow, maxCol, source: 'manual', explanation: `manual override: ${hCount} header row(s) at row ${hStart}, ${vCount} header col(s) at col ${vStart}` };
    }

    const cacheKey = opts.cache && opts.cacheFilename && opts.cacheSheet
        ? `cache:bands:${opts.cacheFilename}:${opts.cacheSheet}:${scanDepth}:${sampleWidth}:${returnWidth}:${useSampling}`
        : null;
    if (opts.cache && cacheKey) {
        try {
            const cached = await opts.cache.recall(cacheKey);
            if (cached) {
                const entry = JSON.parse(cached) as { fingerprint: string; result: DetectBandsResult };
                const fingerprint = computeFingerprint(ws, scanDepth, sampleWidth);
                if (entry.fingerprint === fingerprint) return entry.result;
            }
        } catch { /* */ }
    }

    const heuristic = heuristicBands(ws, wb, scanDepth, sampleWidth);
    let hStart = heuristic.horizontalStart;
    let hEnd = heuristic.horizontalEnd;
    let vStart = heuristic.verticalStart;
    let vEnd = heuristic.verticalEnd;
    let source: 'heuristic' | 'sampling' | 'manual' = 'heuristic';
    let explanation: string | null = heuristic.reason;

    if (useSampling) {
        const rowLimit = Math.min(scanDepth, maxRow);
        const colLimit = Math.min(scanDepth, maxCol);
        const rowSamples = collectSample(ws, 'row', rowLimit, sampleWidth);
        const columnSamples = collectSample(ws, 'col', colLimit, sampleWidth);
        const llm = await sampleToLLM(ctx, rowSamples, columnSamples);
        if (llm !== null) {
            if (isInputRequiredResult(llm)) return llm;
            hStart = llm.horizontalStart;
            hEnd = Math.min(llm.horizontalEnd, scanDepth);
            vStart = llm.verticalStart;
            vEnd = Math.min(llm.verticalEnd, scanDepth);
            source = 'sampling';
            explanation = llm.explanation;
        }
    }

    const horizontal = buildBand(ws, 'row', hStart, hEnd, returnWidth);
    const vertical = buildBand(ws, 'col', vStart, vEnd, returnWidth);

    const result: DetectBandsResult = { horizontal, vertical, maxRow, maxCol, source, explanation };

    if (opts.cache && cacheKey) {
        try {
            const fingerprint = computeFingerprint(ws, scanDepth, sampleWidth);
            await opts.cache.remember(cacheKey, JSON.stringify({ fingerprint, result }));
        } catch { /* */ }
    }

    return result;
};

export class CellDiscoveryHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        const samplingCtxFrom = (reqCtx: unknown): SamplingCtx => {
            const m = (reqCtx as { mcpReq?: { requestSampling?: unknown; inputResponses?: Record<string, unknown> } })?.mcpReq;
            return {
                era: this.context.era,
                requestSampling: m?.requestSampling as SamplingCtx['requestSampling'] | undefined,
                inputResponses: m?.inputResponses
            };
        };

        this.registerTool('detect_headers', { description: 'detect header bands (horizontal at top, vertical at left). The smart heuristic considers structural signals (Excel tables, autoFilter, freeze panes), cell formatting (bold fonts, solid fills, bottom borders), and type-pattern contrast (all-string header vs mixed-type data). **For best detection, leave `useSampling` at its default `true`** — the host LLM is consulted via MCP sampling and given row + column samples; it ignores titles, understands field names, and reports both start and end of the header band via a structured tool call. Falls back to the local heuristic if the host does not support sampling. `headerStartRow` / `headerRows` / `headerStartCol` / `headerCols` let you override the detection manually. Results are cached in SQLite keyed by file+sheet+params with a content fingerprint, so repeated calls (e.g. `get_sample` after `detect_headers`) skip re-detection.', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            scanDepth: z.number().min(1).optional().default(20),
            sampleWidth: z.number().min(1).optional().default(30),
            returnWidth: z.number().min(1).optional().default(30),
            useSampling: z.boolean().optional().default(true),
            headerStartRow: z.number().min(1).optional(),
            headerRows: z.number().min(0).optional(),
            headerStartCol: z.number().min(1).optional(),
            headerCols: z.number().min(0).optional()
        }), outputSchema: z.object({
            hasHeaders: z.boolean().optional(),
            hasHorizontal: z.boolean().optional(),
            horizontalStart: z.number().nullable().optional(),
            horizontalEnd: z.number().nullable().optional(),
            horizontalValues: z.array(z.array(z.string())).nullable().optional(),
            hasVertical: z.boolean().optional(),
            verticalStart: z.number().nullable().optional(),
            verticalEnd: z.number().nullable().optional(),
            verticalValues: z.array(z.array(z.string())).nullable().optional(),
            source: z.enum(['heuristic', 'sampling', 'manual']).optional(),
            explanation: z.string().nullable().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true
        }}, async (arg, ctx) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const wb = await context.getWorkbook(filename);
            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }] });
            const ws: Worksheet = sheet.sheet;

            const bands = await detectBands(ws, wb, samplingCtxFrom(ctx), {
                scanDepth: arg.scanDepth,
                sampleWidth: arg.sampleWidth,
                returnWidth: arg.returnWidth,
                useSampling: arg.useSampling,
                headerStartRow: arg.headerStartRow,
                headerRows: arg.headerRows,
                headerStartCol: arg.headerStartCol,
                headerCols: arg.headerCols,
                cache: context.virtualFileSystem,
                cacheFilename: filename,
                cacheSheet: sheetName ?? undefined
            });
            if (isInputRequiredResult(bands)) return bands;
            const payload = {
                hasHeaders: bands.horizontal !== null || bands.vertical !== null,
                hasHorizontal: bands.horizontal !== null,
                horizontalStart: bands.horizontal?.start ?? null,
                horizontalEnd: bands.horizontal?.end ?? null,
                horizontalValues: bands.horizontal?.values ?? null,
                hasVertical: bands.vertical !== null,
                verticalStart: bands.vertical?.start ?? null,
                verticalEnd: bands.vertical?.end ?? null,
                verticalValues: bands.vertical?.values ?? null,
                source: bands.source,
                explanation: bands.explanation
            };
            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode(payload) }],
                structuredContent: payload
            });
        });

        this.registerTool('get_sample', { description: 'detect headers (LLM by default for best detection, smart heuristic fallback, or manual override via headerStartRow/headerRows/headerStartCol/headerCols), then return a sample of the data area encoded in TOON format. count defaults to 10 and applies per axis (count=10 returns a 10x10 grid). the grid lands in the band after the headers. scanDepth (default 20), sampleWidth (default 30, the LLM decision window), and returnWidth (default 30, band value width) tune the detection; detection results are cached in SQLite.', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            count: z.number().min(1).optional().default(10),
            scanDepth: z.number().min(1).optional().default(20),
            sampleWidth: z.number().min(1).optional().default(30),
            returnWidth: z.number().min(1).optional().default(30),
            useSampling: z.boolean().optional().default(true),
            headerStartRow: z.number().min(1).optional(),
            headerRows: z.number().min(0).optional(),
            headerStartCol: z.number().min(1).optional(),
            headerCols: z.number().min(0).optional()
        }), outputSchema: z.object({
            dataStartRow: z.number().optional(),
            dataStartCol: z.number().optional(),
            rows: z.number().optional(),
            cols: z.number().optional(),
            hasHeaders: z.boolean().optional(),
            headerSource: z.enum(['heuristic', 'sampling', 'manual']).optional(),
            explanation: z.string().nullable().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true
        }}, async (arg, ctx) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const wb = await context.getWorkbook(filename);
            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }] });
            const ws: Worksheet = sheet.sheet;

            const bands = await detectBands(ws, wb, samplingCtxFrom(ctx), {
                scanDepth: arg.scanDepth,
                sampleWidth: arg.sampleWidth,
                returnWidth: arg.returnWidth,
                useSampling: arg.useSampling,
                headerStartRow: arg.headerStartRow,
                headerRows: arg.headerRows,
                headerStartCol: arg.headerStartCol,
                headerCols: arg.headerCols,
                cache: context.virtualFileSystem,
                cacheFilename: filename,
                cacheSheet: sheetName ?? undefined
            });
            if (isInputRequiredResult(bands)) return bands;
            const dataStartRow = (bands.horizontal?.end ?? 0) + 1;
            const dataStartCol = (bands.vertical?.end ?? 0) + 1;
            const count = arg.count;
            const endRow = Math.min(bands.maxRow, dataStartRow + count - 1);
            const endCol = Math.min(bands.maxCol, dataStartCol + count - 1);
            const grid: string[][] = [];
            for (let r = dataStartRow; r <= endRow; r++) {
                const row: string[] = [];
                for (let c = dataStartCol; c <= endCol; c++) {
                    const cell = getCell(ws, r, c);
                    row.push(cell ? cellValueAsString(cell.value) : '');
                }
                grid.push(row);
            }
            const payload = {
                dataStartRow,
                dataStartCol,
                rowsReturned: grid.length,
                colsReturned: grid[0]?.length ?? 0,
                hasHeaders: bands.horizontal !== null || bands.vertical !== null,
                headerSource: bands.source,
                explanation: bands.explanation,
                headers: {
                    horizontal: bands.horizontal?.values ?? null,
                    vertical: bands.vertical?.values ?? null
                },
                sample: grid
            };
            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode(payload) }],
                structuredContent: { dataStartRow, dataStartCol, rows: grid.length, cols: grid[0]?.length ?? 0, hasHeaders: bands.horizontal !== null || bands.vertical !== null, headerSource: bands.source, explanation: bands.explanation }
            });
        });

        this.registerTool('get_row_sample', { description: 'detect headers (LLM by default for best detection, smart heuristic fallback, or manual override via headerStartRow/headerRows/headerStartCol/headerCols), then return N cells of a single data row encoded in TOON format. row defaults to the first data row. count defaults to 10. vertical headers are reported alongside as the column labels for context. scanDepth (default 20), sampleWidth (default 30), and returnWidth (default 30) tune the detection; results are cached.', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            row: z.number().optional(),
            count: z.number().min(1).optional().default(10),
            scanDepth: z.number().min(1).optional().default(20),
            sampleWidth: z.number().min(1).optional().default(30),
            returnWidth: z.number().min(1).optional().default(30),
            useSampling: z.boolean().optional().default(true),
            headerStartRow: z.number().min(1).optional(),
            headerRows: z.number().min(0).optional(),
            headerStartCol: z.number().min(1).optional(),
            headerCols: z.number().min(0).optional()
        }), outputSchema: z.object({
            row: z.number().optional(),
            columns: z.number().optional(),
            hasHeaders: z.boolean().optional(),
            headerSource: z.enum(['heuristic', 'sampling', 'manual']).optional(),
            explanation: z.string().nullable().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true
        }}, async (arg, ctx) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const wb = await context.getWorkbook(filename);
            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }] });
            const ws: Worksheet = sheet.sheet;

            const bands = await detectBands(ws, wb, samplingCtxFrom(ctx), {
                scanDepth: arg.scanDepth,
                sampleWidth: arg.sampleWidth,
                returnWidth: arg.returnWidth,
                useSampling: arg.useSampling,
                headerStartRow: arg.headerStartRow,
                headerRows: arg.headerRows,
                headerStartCol: arg.headerStartCol,
                headerCols: arg.headerCols,
                cache: context.virtualFileSystem,
                cacheFilename: filename,
                cacheSheet: sheetName ?? undefined
            });
            if (isInputRequiredResult(bands)) return bands;
            const dataStartCol = (bands.vertical?.end ?? 0) + 1;
            const r = arg.row ?? (bands.horizontal?.end ?? 0) + 1;
            const count = arg.count;
            const endCol = Math.min(bands.maxCol, dataStartCol + count - 1);

            const headers = bands.horizontal?.values ?? null;
            const sample: string[] = [];
            for (let c = dataStartCol; c <= endCol; c++) {
                const cell = getCell(ws, r, c);
                sample.push(cell ? cellValueAsString(cell.value) : '');
            }
            const payload = {
                row: r,
                startsAtColumn: dataStartCol,
                sample,
                headers,
                hasHeaders: bands.horizontal !== null || bands.vertical !== null,
                headerSource: bands.source,
                explanation: bands.explanation
            };
            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode(payload) }],
                structuredContent: { row: r, columns: sample.length, hasHeaders: bands.horizontal !== null || bands.vertical !== null, headerSource: bands.source, explanation: bands.explanation }
            });
        });

        this.registerTool('get_column_sample', { description: 'detect headers (LLM by default for best detection, smart heuristic fallback, or manual override via headerStartRow/headerRows/headerStartCol/headerCols), then return N cells of a single data column encoded in TOON format. column defaults to the first data column. count defaults to 10. horizontal headers are reported alongside so the column value is labelled with its name. scanDepth (default 20), sampleWidth (default 30), and returnWidth (default 30) tune the detection; results are cached.', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            column: z.number().optional(),
            count: z.number().min(1).optional().default(10),
            scanDepth: z.number().min(1).optional().default(20),
            sampleWidth: z.number().min(1).optional().default(30),
            returnWidth: z.number().min(1).optional().default(30),
            useSampling: z.boolean().optional().default(true),
            headerStartRow: z.number().min(1).optional(),
            headerRows: z.number().min(0).optional(),
            headerStartCol: z.number().min(1).optional(),
            headerCols: z.number().min(0).optional()
        }), outputSchema: z.object({
            column: z.number().optional(),
            rows: z.number().optional(),
            hasHeaders: z.boolean().optional(),
            headerSource: z.enum(['heuristic', 'sampling', 'manual']).optional(),
            explanation: z.string().nullable().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true
        }}, async (arg, ctx) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const wb = await context.getWorkbook(filename);
            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }] });
            const ws: Worksheet = sheet.sheet;

            const bands = await detectBands(ws, wb, samplingCtxFrom(ctx), {
                scanDepth: arg.scanDepth,
                sampleWidth: arg.sampleWidth,
                returnWidth: arg.returnWidth,
                useSampling: arg.useSampling,
                headerStartRow: arg.headerStartRow,
                headerRows: arg.headerRows,
                headerStartCol: arg.headerStartCol,
                headerCols: arg.headerCols,
                cache: context.virtualFileSystem,
                cacheFilename: filename,
                cacheSheet: sheetName ?? undefined
            });
            if (isInputRequiredResult(bands)) return bands;
            const dataStartRow = (bands.horizontal?.end ?? 0) + 1;
            const c = arg.column ?? (bands.vertical?.end ?? 0) + 1;
            const count = arg.count;
            const endRow = Math.min(bands.maxRow, dataStartRow + count - 1);

            const columnHeader = (bands.horizontal?.values ?? [])
                .map((row) => row[c - 1] ?? '')
                .filter((v: string) => v !== '');

            const sample: string[] = [];
            for (let r = dataStartRow; r <= endRow; r++) {
                const cell = getCell(ws, r, c);
                sample.push(cell ? cellValueAsString(cell.value) : '');
            }
            const payload = {
                column: c,
                startsAtRow: dataStartRow,
                columnHeader,
                sample,
                hasHeaders: bands.horizontal !== null || bands.vertical !== null,
                headerSource: bands.source,
                explanation: bands.explanation
            };
            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode(payload) }],
                structuredContent: { column: c, rows: sample.length, hasHeaders: bands.horizontal !== null || bands.vertical !== null, headerSource: bands.source, explanation: bands.explanation }
            });
        });
    }
}