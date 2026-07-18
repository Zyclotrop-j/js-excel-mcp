import { ToolHandler } from '../interface.js';
import { getCell, getMaxRow, getMaxCol, type Worksheet } from '@office-kit/xlsx/worksheet';
import { cellValueAsString, cellValueAsDate, isErrorCell, getFormulaText } from '@office-kit/xlsx/cell';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import { coordinateToTuple, tupleToCoordinate } from '@office-kit/xlsx/utils';
import { encode } from '@toon-format/toon';
import z from 'zod';
import { Context } from '../../filesystem/context.js';

export class CellCursorHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('move_cell_cursor', { description: 'move the cell cursor through a sequence of moves. Each move is either a step in a direction with a stopping condition (fixed count, blank, error, value compare, regex, date compare), a jump to a specific target cell, or a jump-to-original that returns to the cell the cursor was on when this tool call started. Step moves can carry an optional `max` cap, so a condition-stopped move will abort after `max` cells if it hasn\'t fired yet (useful for "move until blank, but at most 100 cells"). Every traversed cell is reported with its stop reason.', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            moves: z.array(z.union([
                z.object({
                    direction: z.enum(['up', 'down', 'left', 'right']),
                    max: z.number().min(1).optional(),
                    count: z.union([
                        z.number().min(1),
                        z.enum(['UNTIL_BLANK', 'UNTIL_ERROR']),
                        z.object({
                            type: z.literal('condition'),
                            operator: z.enum(['=', '!=', '>', '<', '>=', '<=']),
                            value: z.union([z.string(), z.number(), z.boolean()])
                        }),
                        z.object({
                            type: z.literal('regex'),
                            pattern: z.string()
                        }),
                        z.object({
                            type: z.literal('date'),
                            operator: z.enum(['=', '!=', '>', '<', '>=', '<=']),
                            value: z.string()
                        })
                    ])
                }),
                z.object({
                    direction: z.literal('jump'),
                    target: z.union([
                        z.string(),
                        z.object({ row: z.number(), col: z.number() })
                    ])
                }),
                z.object({
                    direction: z.literal('jump-to-original')
                })
            ]))
        }), outputSchema: z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            visitedCount: z.number().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: true
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            const currentCell = await context.getCurrentCell();
            if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no current cell set' }], isError: true });

            const start = coordinateToTuple(currentCell);
            const maxRow = getMaxRow(ws);
            const maxCol = getMaxCol(ws);

            const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

            const compare = (rawValue: unknown, operator: string, target: string | number | boolean): boolean => {
                if (operator === '=') return rawValue === target || (rawValue != null && target != null && String(rawValue) === String(target));
                if (operator === '!=') return !(rawValue === target || (rawValue != null && target != null && String(rawValue) === String(target)));

                if (typeof rawValue === 'boolean' && typeof target === 'boolean') {
                    const a = rawValue ? 1 : 0;
                    const b = target ? 1 : 0;
                    switch (operator) {
                        case '>': return a > b;
                        case '<': return a < b;
                        case '>=': return a >= b;
                        case '<=': return a <= b;
                    }
                }

                const cellNum = typeof rawValue === 'number' ? rawValue : Number(String(rawValue));
                const targetNum = typeof target === 'number' ? target : Number(String(target));
                const cellStr = String(rawValue).trim();
                const targetStr = String(target).trim();
                const numeric = cellStr !== '' && targetStr !== '' && !isNaN(cellNum) && !isNaN(targetNum);
                if (numeric) {
                    switch (operator) {
                        case '>': return cellNum > targetNum;
                        case '<': return cellNum < targetNum;
                        case '>=': return cellNum >= targetNum;
                        case '<=': return cellNum <= targetNum;
                    }
                }
                switch (operator) {
                    case '>': return cellStr > targetStr;
                    case '<': return cellStr < targetStr;
                    case '>=': return cellStr >= targetStr;
                    case '<=': return cellStr <= targetStr;
                }
                return false;
            };

            const visited: { ref: string; value: string; formula: string | null }[] = [];
            const stops: { direction: string; reason: string; at: string }[] = [];
            let row = start.row;
            let col = start.col;

            const addCell = (r: number, c: number) => {
                const ref = tupleToCoordinate(c, r);
                const cell = getCell(ws, r, c);
                visited.push({
                    ref,
                    value: cell ? cellValueAsString(cell.value) : '',
                    formula: cell ? getFormulaText(cell) ?? null : null
                });
            };

            const isBlank = (r: number, c: number): boolean => {
                const cell = getCell(ws, r, c);
                if (!cell) return true;
                const v = cellValueAsString(cell.value);
                return v === '' || v === 'null';
            };

            const SAFETY_CAP = Math.max(maxRow, maxCol, 1000) * 2;
            const origin = { row: start.row, col: start.col };

            for (const move of arg.moves) {
                if (move.direction === 'jump-to-original') {
                    row = clamp(origin.row, 1, maxRow);
                    col = clamp(origin.col, 1, maxCol);
                    addCell(row, col);
                    stops.push({ direction: 'jump-to-original', reason: 'origin', at: tupleToCoordinate(col, row) });
                    continue;
                }
                if (move.direction === 'jump') {
                    let jRow: number;
                    let jCol: number;
                    if (typeof move.target === 'string') {
                        const t = coordinateToTuple(move.target);
                        jRow = t.row;
                        jCol = t.col;
                    } else {
                        jRow = move.target.row;
                        jCol = move.target.col;
                    }
                    row = clamp(jRow, 1, maxRow);
                    col = clamp(jCol, 1, maxCol);
                    addCell(row, col);
                    stops.push({ direction: 'jump', reason: (row !== jRow || col !== jCol) ? 'clamped' : 'target', at: tupleToCoordinate(col, row) });
                    continue;
                }

                let stopReason = '';
                let steps = 0;
                const perMoveCap = move.max ?? SAFETY_CAP;

                while (!stopReason && steps < perMoveCap) {
                    const beforeRow = row;
                    const beforeCol = col;
                    switch (move.direction) {
                        case 'right': col = clamp(col + 1, 1, maxCol); break;
                        case 'left':  col = clamp(col - 1, 1, maxCol); break;
                        case 'down':  row = clamp(row + 1, 1, maxRow); break;
                        case 'up':    row = clamp(row - 1, 1, maxRow); break;
                    }
                    const moved = row !== beforeRow || col !== beforeCol;
                    addCell(row, col);
                    steps++;

                    if (!moved) {
                        stopReason = 'edge';
                        break;
                    }

                    if (typeof move.count === 'number') {
                        if (steps >= move.count) stopReason = 'count_reached';
                    } else if (move.count === 'UNTIL_BLANK') {
                        if (isBlank(row, col)) stopReason = 'blank';
                    } else if (move.count === 'UNTIL_ERROR') {
                        const cell = getCell(ws, row, col);
                        if (cell && isErrorCell(cell)) stopReason = 'error';
                    } else if (move.count.type === 'condition') {
                        const cell = getCell(ws, row, col);
                        const rawValue = cell ? cell.value : null;
                        if (compare(rawValue, move.count.operator, move.count.value)) {
                            stopReason = 'value_match';
                        }
                    } else if (move.count.type === 'regex') {
                        let re: RegExp;
                        try {
                            re = new RegExp(move.count.pattern);
                        } catch {
                            stopReason = 'invalid_regex';
                            break;
                        }
                        const cell = getCell(ws, row, col);
                        const cellStr = cell ? cellValueAsString(cell.value) : '';
                        if (re.test(cellStr)) stopReason = 'regex_match';
                    } else if (move.count.type === 'date') {
                        const cell = getCell(ws, row, col);
                        const cellDate = cell ? cellValueAsDate(cell.value) : undefined;
                        const targetMs = Date.parse(move.count.value);
                        if (cellDate && !isNaN(targetMs)) {
                            const cellMs = cellDate.getTime();
                            const eq = cellMs === targetMs;
                            const lt = cellMs < targetMs;
                            const gt = cellMs > targetMs;
                            switch (move.count.operator) {
                                case '=':  if (eq) stopReason = 'date_match'; break;
                                case '!=': if (!eq) stopReason = 'date_match'; break;
                                case '>':  if (gt) stopReason = 'date_match'; break;
                                case '<':  if (lt) stopReason = 'date_match'; break;
                                case '>=': if (gt || eq) stopReason = 'date_match'; break;
                                case '<=': if (lt || eq) stopReason = 'date_match'; break;
                            }
                        }
                    }
                }

                if (!stopReason) stopReason = move.max !== undefined ? 'max_reached' : 'safety_cap';
                stops.push({ direction: move.direction, reason: stopReason, at: tupleToCoordinate(col, row) });
            }

            const finalRef = tupleToCoordinate(col, row);
            await context.setCurrentCell(finalRef);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({
                    from: currentCell,
                    to: finalRef,
                    moves: arg.moves,
                    stops,
                    visited
                }) }],
                structuredContent: { from: currentCell, to: finalRef, visitedCount: visited.length }
            });
        });
    }
}
