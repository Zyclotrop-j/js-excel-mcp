import { Workbook } from "exceljs";
import { FileSerialiser } from "./utiltypes.js";
import { LRUCache } from 'lru-cache';
import { createFsFromVolume, Volume } from 'memfs';

const vol = new Volume();
const fs = createFsFromVolume(vol);

const inMemoryStore = new LRUCache<string, Workbook>({
    max: 100,
    ttl: 1000 * 60 * 5, // 5 minutes
});

abstract class SingeltonStorrageFileSerialiser<T> extends FileSerialiser<T> {
    static get memoryStore() {
        return inMemoryStore;
    }
    static get fs() {
        return fs;
    }
}

export class ExcelFileSerialiser extends SingeltonStorrageFileSerialiser<Workbook> {
    filename: string;
    constructor() {
        super();
        this.filename = crypto.randomUUID() + ".xlsx";
    }

    async deserialize(path: string): Promise<Workbook> {
      if(inMemoryStore.has(path)) {
        return inMemoryStore.get(path)!;
      }
      const workbook = new Workbook();
      const buffer = fs.readFileSync(path, { encoding: 'buffer' });
      await workbook.xlsx.load(Buffer.from(buffer).buffer);
      inMemoryStore.set(path, workbook);
      return workbook;
    }
    async serialize(data: Workbook): Promise<string> {
      const path = `./tmp/${this.filename}`;
      const buffer = await data.xlsx.writeBuffer();
      fs.writeFileSync(path, Buffer.from(buffer));
      inMemoryStore.set(path, data);
      return path;
    }
    get outputFileName(): string {
        return this.filename;
    }
    get outputMimeType(): string {
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
}

export function parseExcelReference(refString: string): { sheet: string | null; cell: string } {
  const regex = /^(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})?)$/;
  const match = refString.match(regex);

  if (!match) throw new Error(`Invalid Excel reference: ${refString}`);

  return {
    // Group 1 catches quoted sheets, Group 2 catches unquoted sheets
    sheet: match[1] || match[2] || null, 
    // Group 3 catches the entire cell or range reference
    cell: match[3]
  };
}
export function formatExcelReference({ sheet, cell }: { sheet: string | null; cell: string }) {
  if (!sheet) return cell;
  
  // Wrap in quotes if there are spaces, symbols, or it looks like a cell (e.g., "A1")
  const needsQuotes = /[^A-Za-z0-9_]|^[A-Za-z]{1,3}[1-9]\d*$/i.test(sheet);
  
  // Escape existing single quotes by doubling them up up (' -> '')
  const safeSheet = needsQuotes 
    ? `'${sheet.replace(/'/g, "''")}'` 
    : sheet;

  return `${safeSheet}!${cell}`;
};