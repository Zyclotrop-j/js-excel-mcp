import { loadWorkbook, fromArrayBuffer } from '@office-kit/xlsx/io';
import * as fs from 'node:fs';

const bytes = fs.readFileSync('C:/Users/Janne/AppData/Local/Temp/opencode/discovery-test.xlsx');
const wb = loadWorkbook(fromArrayBuffer(bytes));

console.log('wb keys:', Object.keys(wb));
console.log('wb:', JSON.stringify(wb, (key, value) => {
    if (value instanceof Map) return Object.fromEntries(value);
    if (value instanceof Set) return Array.from(value);
    return value;
}, 2).substring(0, 2000));