/**
 * Self-reference detector used by `set_formula` to surface (not block)
 * accidental circular formulas. The LLM that generated Q4_Sales_Dashboard
 * wrote `=E14/D14-1` on cell E14 (the MoM-growth column referenced itself),
 * which Excel flagged as a circular reference on open. The detector now
 * surfaces that as a non-fatal warning in the tool response.
 */
import { strict as assert } from 'assert';
import { detectSelfReference } from '../../src/util/detectSelfReference.js';

export default function (test: any) {

    test('detectSelfReference: flags a direct self-reference (=E14/D14-1 on E14)', () => {
        const w = detectSelfReference('=E14/D14-1', 'E14');
        assert.ok(w.length >= 1, 'should flag E14 referencing itself');
        assert.ok(w.some(s => s.includes('E14')), `warning should mention E14, got: ${JSON.stringify(w)}`);
    });

    test('detectSelfReference: no warning when formula references other cells only', () => {
        const w = detectSelfReference('=D14/C14-1', 'E14');
        assert.deepEqual(w, []);
    });

    test('detectSelfReference: flags a self-reference written with $ absolute markers', () => {
        const w = detectSelfReference('=$E$14*2', 'E14');
        assert.ok(w.length >= 1);
    });

    test('detectSelfReference: flags a self-reference written in lowercase', () => {
        const w = detectSelfReference('=e14/2', 'E14');
        assert.ok(w.length >= 1);
    });

    test('detectSelfReference: flags when the target lies inside a range', () => {
        const w = detectSelfReference('=SUM(A1:A10)', 'A5');
        assert.ok(w.length >= 1);
        assert.ok(w[0].includes('A1:A10'));
    });

    test('detectSelfReference: no warning when the target is outside the range', () => {
        const w = detectSelfReference('=SUM(A1:A10)', 'A11');
        assert.deepEqual(w, []);
    });

    test('detectSelfReference: no warning for a same-cell column-letter overlap with a function name (LOG10)', () => {
        const w = detectSelfReference('=LOG10(2)', 'LOG10');
        assert.deepEqual(w, []);
    });

    test('detectSelfReference: no warning when the cell ref is sheet-qualified (different sheet unknown)', () => {
        const w = detectSelfReference('=Sheet1!E14+1', 'E14');
        assert.deepEqual(w, []);
    });

    test('detectSelfReference: returns no warnings for a formula without refs', () => {
        const w = detectSelfReference('=1+2*3', 'A1');
        assert.deepEqual(w, []);
    });

    test('detectSelfReference: returns no warnings for an unparseable target ref', () => {
        const w = detectSelfReference('=A1+1', 'not-a-cell');
        assert.deepEqual(w, []);
    });

    test('detectSelfReference: handles a self-reference embedded in a larger expression', () => {
        const w = detectSelfReference('=IF(E14>0, E14*2, 0)', 'E14');
        assert.ok(w.length >= 1);
    });

    test('detectSelfReference: de-duplicates a repeated self-reference', () => {
        const w = detectSelfReference('=E14/E14', 'E14');
        assert.equal(w.length, 1);
    });
}
