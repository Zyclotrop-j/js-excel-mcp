const fs = require('fs');

const file = 'test/integration/export-import-flow.test.ts';
let content = fs.readFileSync(file, 'utf8');

// Normalize line endings
const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
content = content.replace(/\r\n/g, '\n');

const lines = content.split('\n');
const result = [];
let i = 0;

while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^(\s*)test\('([^']+)',\s*async\s*\(\)\s*=>\s*\{$/);

    if (match) {
        const indent = match[1];
        const innerIndent = indent + '    ';

        // Collect body lines until matching closing brace
        let depth = 1;
        let j = i + 1;
        const bodyLines = [];
        while (j < lines.length && depth > 0) {
            const bl = lines[j];
            for (let c = 0; c < bl.length; c++) {
                if (bl[c] === '{') depth++;
                else if (bl[c] === '}') depth--;
            }
            if (depth > 0) bodyLines.push(bl);
            j++;
        }

        const bodyText = bodyLines.join('\n');
        const needsWrap = bodyText.includes('.cb(') || bodyText.includes('.register(');

        result.push(line); // test('name', async () => {

        if (needsWrap && bodyLines.length > 0) {
            result.push(innerIndent + 'await run(async () => {');
            for (const bl of bodyLines) {
                if (bl.trim() === '') {
                    result.push('');
                } else {
                    result.push('    ' + bl);
                }
            }
            result.push(innerIndent + '});');
        } else {
            for (const bl of bodyLines) {
                result.push(bl);
            }
        }

        result.push(lines[j - 1]); // closing });
        i = j;
    } else {
        result.push(line);
        i++;
    }
}

const output = result.join(lineEnding);
fs.writeFileSync(file, output);
console.log('Transformed: ' + file);
