/**
 * Unit tests for mcpdescription constants.
 */
import test from 'baretest';
import { strict as assert } from 'node:assert';
import { mcpName, mcpTitle, mcpVersion, mcpDescription, mcpInstructions } from '../../src/meta/mcpdescription.js';

test('mcpdescription', async () => {

    test('mcpName is a non-empty string', async () => {
        assert.ok(typeof mcpName === 'string');
        assert.ok(mcpName.length > 0);
    });

    test('mcpTitle is a non-empty string', async () => {
        assert.ok(typeof mcpTitle === 'string');
        assert.ok(mcpTitle.length > 0);
    });

    test('mcpVersion is a non-empty string', async () => {
        assert.ok(typeof mcpVersion === 'string');
        assert.ok(mcpVersion.length > 0);
    });

    test('mcpDescription is a non-empty string', async () => {
        assert.ok(typeof mcpDescription === 'string');
        assert.ok(mcpDescription.length > 0);
    });

    test('mcpInstructions is a non-empty string', async () => {
        assert.ok(typeof mcpInstructions === 'string');
        assert.ok(mcpInstructions.length > 0);
    });

    test('mcpInstructions mentions key tools', async () => {
        assert.ok(mcpInstructions.includes('get_cell'), 'Should mention get_cell');
        assert.ok(mcpInstructions.includes('set_cell'), 'Should mention set_cell');
        assert.ok(mcpInstructions.includes('detect_headers'), 'Should mention detect_headers');
        assert.ok(mcpInstructions.includes('chain_operations'), 'Should mention chain_operations');
        assert.ok(mcpInstructions.includes('create_new_workbook'), 'Should mention create_new_workbook');
    });

    test('mcpInstructions describes sticky state', async () => {
        assert.ok(mcpInstructions.includes('currentFile'), 'Should mention currentFile');
        assert.ok(mcpInstructions.includes('currentSheet'), 'Should mention currentSheet');
        assert.ok(mcpInstructions.includes('currentCell'), 'Should mention currentCell');
    });

    test('mcpInstructions describes typical workflow', async () => {
        assert.ok(mcpInstructions.includes('Typical workflow'), 'Should mention workflow');
        assert.ok(mcpInstructions.includes('Get a workbook'), 'Should mention getting workbook');
        assert.ok(mcpInstructions.includes('Pick the sheet'), 'Should mention picking sheet');
    });

    test('mcpInstructions mentions gotchas', async () => {
        assert.ok(mcpInstructions.includes('Gotchas'), 'Should mention gotchas');
        assert.ok(mcpInstructions.includes('AARRGGBB'), 'Should mention color format');
    });
});

export default test;
