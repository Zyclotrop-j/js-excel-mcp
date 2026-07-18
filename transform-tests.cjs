const fs = require('fs');

const files = [
  'test/integration/workbook-flow.test.ts',
  'test/integration/sheet-ops-flow.test.ts',
  'test/integration/cell-ops-flow.test.ts',
  'test/integration/style-flow.test.ts',
  'test/integration/chain-flow.test.ts',
  'test/integration/data-validation-flow.test.ts',
  'test/integration/export-import-flow.test.ts',
  'test/integration/auth-flow.test.ts',
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Detect original line ending
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  
  // Normalize to \n for processing
  content = content.replace(/\r\n/g, '\n');
  
  // Add import if not present
  if (!content.includes('requestContext')) {
    const lines = content.split('\n');
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) insertIdx = i + 1;
    }
    lines.splice(insertIdx, 0, "import { run } from '../../src/util/requestContext.js';");
    content = lines.join('\n');
  }
  
  // Transform test bodies
  const lines = content.split('\n');
  const result = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^test\('([^']+)',\s*async\s*\(\)\s*=>\s*\{$/);
    
    if (match) {
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
      
      // Check if body contains .cb( or .register(
      const bodyText = bodyLines.join('\n');
      const needsWrap = bodyText.includes('.cb(') || bodyText.includes('.register(');
      
      result.push(line); // test('name', async () => {
      
      if (needsWrap && bodyLines.length > 0) {
        result.push('    await run(async () => {');
        for (const bl of bodyLines) {
          if (bl.trim() === '') {
            result.push('');
          } else {
            result.push('    ' + bl);
          }
        }
        result.push('    });');
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
  
  // Restore original line endings
  const output = result.join(lineEnding);
  fs.writeFileSync(file, output);
  console.log('Transformed: ' + file);
}
console.log('Done!');
