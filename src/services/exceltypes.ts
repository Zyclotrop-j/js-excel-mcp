import z from 'zod/v4';


export const excelCellReferenceSchema = z.string().regex(/^(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})?)$/).meta({description: "The cell reference"});
export const excelCellRangeReferenceSchema = z.string().regex(/^(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}:\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})$/).meta({description: "The cell range"});
export const excelFormulaSchema = z.string().refine(() => true);

const isoDatetimeToDate = z.codec(z.iso.datetime(), z.date(), {
  decode: (isoString) => new Date(isoString),
  encode: (date) => date.toISOString(),
});

export const primitiveCellValue = z.union([
    z.number(),
    z.string(),
    z.boolean(),
    isoDatetimeToDate,
    z.object({
        error: z.enum([
            '#N/A',
            '#REF!',
            '#NAME?',
            '#DIV/0!',
            '#VALUE!',
            '#NUM!',
            '#NULL!'
        ])
    }), // CellErrorValue
]);
export const primitiveCellValueInverse = z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.invertCodec(isoDatetimeToDate),
    z.object({
        error: z.enum([
            '#N/A',
            '#REF!',
            '#NAME?',
            '#DIV/0!',
            '#VALUE!',
            '#NUM!',
            '#NULL!'
        ])
    }), // CellErrorValue
]);
export const richTextDef =  z.object({
        richText: z.array(z.object({
            text: z.string(),
            font: z.object({
                italic: z.boolean().optional(),
                size: z.number().optional(),
                color: z.object({
                    theme: z.number().optional(),
                    argb: z.string().optional()
                }).optional(),
                name: z.string().optional(),
                family: z.number().optional(),
                scheme: z.enum(['major', 'minor', 'none']).optional()
            }).optional()
        }))
    });  // CellRichTextValue

export const cellValue = z.union([
                ...primitiveCellValue.options,
                z.null(),
                richTextDef, // CellRichTextValue
                z.object({
                    text: z.string(),
                    hyperlink: z.string(),
                    tooltip: z.string().optional()
                }), // CellHyperlinkValue
                z.object({
                    formula: excelFormulaSchema,
                    result: primitiveCellValue 
                }), // CellFormulaValue
                z.union([z.object({ // Master
                    formula: excelCellReferenceSchema,
                    result: primitiveCellValue,
                    shareType: z.literal('shared'),
                    ref: excelCellRangeReferenceSchema
                }), z.object({ // Shared
                    sharedFormula: excelCellReferenceSchema,
                    result: primitiveCellValue
                }), z.object({ // Array
                    formula: excelFormulaSchema,
                    result: primitiveCellValue,
                    shareType: z.literal('array'),
                    ref: excelCellRangeReferenceSchema
                    
                })])  // CellSharedFormulaValue
            ])

export const cellValueInverse = z.union([
                ...primitiveCellValueInverse.options,
                z.null(),
                richTextDef, // CellRichTextValue
                z.object({
                    text: z.string(),
                    hyperlink: z.string(),
                    tooltip: z.string().optional()
                }), // CellHyperlinkValue
                z.object({
                    formula: excelFormulaSchema,
                    result: primitiveCellValue 
                }), // CellFormulaValue
                z.union([z.object({ // Master
                    formula: excelCellReferenceSchema,
                    result: primitiveCellValue,
                    shareType: z.literal('shared'),
                    ref: excelCellRangeReferenceSchema
                }), z.object({ // Shared
                    sharedFormula: excelCellReferenceSchema,
                    result: primitiveCellValue
                }), z.object({ // Array
                    formula: excelFormulaSchema,
                    result: primitiveCellValue,
                    shareType: z.literal('array'),
                    ref: excelCellRangeReferenceSchema
                    
                })])  // CellSharedFormulaValue
            ])