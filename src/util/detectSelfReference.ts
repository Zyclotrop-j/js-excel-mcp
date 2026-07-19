import { columnIndexFromLetter, coordinateToTuple, isValidColumnLetter, isValidRowNumber } from '@office-kit/xlsx/utils';

/**
 * Detect direct self-references in an Excel formula. Returns a list of
 * human-readable warning strings (empty if none).
 *
 * Scope: this is a best-effort, conservative detector. It catches the common
 * mistakes — bare cell refs that match the target (`=E14/D14-1` on cell E14)
 * and ranges that include the target (`=SUM(A1:A10)` on cell A5). It is NOT a
 * full formula analyser: it does not follow indirect chains, does not evaluate
 * names, and treats sheet-qualified refs (`Sheet1!E14`) as out-of-scope (it
 * skips refs preceded by `!`). Function names followed by `(` are excluded so
 * that `LOG10`, `ATAN2`, etc. are not mistaken for cell refs.
 */
export function detectSelfReference(formula: string, targetRef: string): string[] {
    let target: { col: number; row: number };
    try {
        target = coordinateToTuple(targetRef);
    } catch {
        return [];
    }

    const warnings: string[] = [];
    const consumed: Array<[number, number]> = [];

    const rangeRe = /\$?([A-Za-z]{1,3})\$?(\d+):\$?([A-Za-z]{1,3})\$?(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = rangeRe.exec(formula)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (start > 0 && formula[start - 1] === '!') continue;
        consumed.push([start, end]);
        if (!isValidColumnLetter(m[1]) || !isValidColumnLetter(m[3])) continue;
        if (!isValidRowNumber(parseInt(m[2], 10)) || !isValidRowNumber(parseInt(m[4], 10))) continue;
        const col1 = columnIndexFromLetter(m[1].toUpperCase());
        const row1 = parseInt(m[2], 10);
        const col2 = columnIndexFromLetter(m[3].toUpperCase());
        const row2 = parseInt(m[4], 10);
        const minCol = Math.min(col1, col2), maxCol = Math.max(col1, col2);
        const minRow = Math.min(row1, row2), maxRow = Math.max(row1, row2);
        if (target.col >= minCol && target.col <= maxCol && target.row >= minRow && target.row <= maxRow) {
            const msg = `formula range ${m[0]} includes the target cell ${targetRef}`;
            if (!warnings.includes(msg)) warnings.push(msg);
        }
    }

    const cellRe = /\$?([A-Za-z]{1,3})\$?(\d+)/g;
    while ((m = cellRe.exec(formula)) !== null) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (start > 0 && formula[start - 1] === '!') continue;
        if (consumed.some(([s, e]) => start >= s && end <= e)) continue;
        if (/^\s*\(/.test(formula.slice(end))) continue;
        if (!isValidColumnLetter(m[1]) || !isValidRowNumber(parseInt(m[2], 10))) continue;
        const col = columnIndexFromLetter(m[1].toUpperCase());
        const row = parseInt(m[2], 10);
        if (col === target.col && row === target.row) {
            const msg = `formula references the target cell ${targetRef}`;
            if (!warnings.includes(msg)) warnings.push(msg);
        }
    }

    return warnings;
}
