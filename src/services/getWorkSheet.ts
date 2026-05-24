import { Workbook, Worksheet } from "exceljs";

export default function getWorksheet(args: {
    worksheetName?: string | null;
    sheet?: string | number | null;
    sheetIndex?: number | null;
    worksheetId?: number | null;
}, workbook: Workbook, withDefault: boolean = true): Worksheet {
    if (args.worksheetName) {
        const r = workbook.getWorksheet(args.worksheetName);
        if (r) return r;
    }
    if (typeof args.sheet === 'string' || typeof args.sheet === 'number') {
        const r = workbook.getWorksheet(args.sheet);
        if (r) return r;
    }
    if(args.sheetIndex || args.sheetIndex === 0) {
        const r = workbook.getWorksheet(args.sheetIndex);
        if (r) return r;
    }
    if (args.worksheetId != undefined) {
        for(const ws of workbook.worksheets) {
            if (ws.id === args.worksheetId) {
                return ws;
            }
        }
    }
    if(withDefault){
        const r = workbook.getWorksheet(1);
        if (r) return r;
    }
    throw new Error("Worksheet not found");
}