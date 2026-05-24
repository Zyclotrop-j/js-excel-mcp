import z from 'zod/v4';


export const excelCellReferenceSchema = z.string().regex(/^(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}(?::\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})?)$/).meta({description: "The cell reference. Format: A1, B2, $A$1, A1:B2, etc. Examples: \"A1\", \"B2\", \"$A$1\", \"A1:B2\""});
export const excelCellRangeReferenceSchema = z.string().regex(/^(?:(?:'([^']+)'|([A-Za-z0-9_]+))!)?(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}:\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})$/).meta({description: "The cell range. Format: A1:B2. Examples: \"A1:B10\", \"B2:D5\", \"$A$1:$B$10\""});
export const excelFormulaSchema = z.string().refine(() => true).meta({description: `Excel formula. Examples: "=SUM(A1:A10)", "=A1+B1", "=IF(A1>0, \\"Yes\\", \\"No\\")"`});

const isoDatetimeToDate = z.codec(z.iso.datetime(), z.date(), {
  decode: (isoString) => new Date(isoString),
  encode: (date) => date.toISOString(),
});

export const primitiveCellValue = z.union([
    z.number().meta({description: "Numeric value. Examples: 1, 3.14, -100"}).refine(val => !isNaN(val), "Must be a valid number"),
    z.string().meta({description: "Text value. Examples: \"Hello World\", \"Status: Active\""}),
    z.boolean().meta({description: "Boolean value. Examples: true, false"}),
    isoDatetimeToDate.meta({description: "Date/time value. ISO format: \"2024-01-15T12:00:00Z\""}),
    z.object({
        error: z.enum([
            '#N/A',
            '#REF!',
            '#NAME?',
            '#DIV/0!',
            '#VALUE!',
            '#NUM!',
            '#NULL!'
        ]).meta({description: "Excel error value. Examples: \"#REF!\", \"#DIV/0!\""})
    }).meta({description: "Cell error value"}), // CellErrorValue
]);

export const primitiveCellValueInverse = z.union([
    z.number().meta({description: "Numeric value. Examples: 1, 3.14, -100"}).refine(val => !isNaN(val), "Must be a valid number"),
    z.string().meta({description: "Text value. Examples: \"Hello World\", \"Status: Active\""}),
    z.boolean().meta({description: "Boolean value. Examples: true, false"}),
    z.invertCodec(isoDatetimeToDate).meta({description: "Date/time value. ISO format: \"2024-01-15T12:00:00Z\""}),
    z.object({
        error: z.enum([
            '#N/A',
            '#REF!',
            '#NAME?',
            '#DIV/0!',
            '#VALUE!',
            '#NUM!',
            '#NULL!'
        ]).meta({description: "Excel error value. Examples: \"#REF!\", \"#DIV/0!\""})
    }).meta({description: "Cell error value"}), // CellErrorValue
]);

export const richTextDef =  z.object({
        richText: z.array(z.object({
            text: z.string().meta({description: "Text content. Examples: \"Bold text\", \"Regular text\""}),
            font: z.object({
                italic: z.boolean().optional().meta({description: "Whether the text is italic. Examples: true, false"}),
                size: z.number().optional().meta({description: "Font size in points. Examples: 8, 10, 12, 16"}),
                color: z.object({
                    theme: z.number().optional().meta({description: "Theme color index. Range: 0-65. Example: 1"}),
                    argb: z.string().regex(/^[0-9A-F]{8}$/i).optional().meta({description: "ARGB color code. Hex format: 8 characters. Range: 00000000 to FFFFFFFF. Examples: \"FF000000\" (black), \"FFFFFFFF\" (white), \"FFFF0000\" (red)"})
                }).optional().meta({description: "Font color. Either theme (number) or ARGB (hex string)"}),
                name: z.string().optional().meta({description: "Font name. Examples: \"Arial\", \"Calibri\", \"Times New Roman\""}),
                family: z.number().optional().meta({description: "Font family. Range: 1-10. Examples: 1 (Normal), 2 (Symbol), 3 (Modern)"}),
                scheme: z.enum(['major', 'minor', 'none']).optional().meta({description: "Font scheme. Options: \"major\", \"minor\", \"none\""})
            }).optional().meta({description: "Font formatting options"})
        })).meta({description: "Rich text formatting with multiple text segments. Each segment can have different formatting"})
    }).meta({description: "Cell rich text value with multiple formatted segments"});  // CellRichTextValue

export const cellValue = z.union([
                ...primitiveCellValue.options,
                z.null().meta({description: "Empty cell value"}),
                richTextDef, // CellRichTextValue
                z.object({
                    text: z.string().meta({description: "Hyperlink text. Examples: \"Click here\", \"Google\""}),
                    hyperlink: z.string().url().meta({description: "URL for the hyperlink. Examples: \"https://google.com\", \"mailto:user@example.com\""}),
                    tooltip: z.string().optional().meta({description: "Tooltip text when hovering over link. Examples: \"Visit Google\", \"Send email\""})
                }).meta({description: "Cell hyperlink value with text and URL"}), // CellHyperlinkValue
                z.object({
                    formula: excelFormulaSchema,
                    result: primitiveCellValue
                }).meta({description: "Cell formula with result. Formula starts with \"=\". Examples: {formula: \"=SUM(A1:A10)\", result: 100}"}), // CellFormulaValue
                z.union([z.object({ // Master
                    formula: excelCellReferenceSchema,
                    result: primitiveCellValue,
                    shareType: z.literal('shared').meta({description: "Shared formula type. Always \"shared\""}),
                    ref: excelCellRangeReferenceSchema
                }).meta({description: "Master shared formula across a range"}), z.object({ // Shared
                    sharedFormula: excelCellReferenceSchema,
                    result: primitiveCellValue
                }).meta({description: "Shared formula referencing a master"}), z.object({ // Array
                    formula: excelFormulaSchema,
                    result: primitiveCellValue,
                    shareType: z.literal('array').meta({description: "Array formula type. Always \"array\""}),
                    ref: excelCellRangeReferenceSchema

                })]).meta({description: "Shared or array formula across a cell range"})  // CellSharedFormulaValue
            ]).meta({description: "Union of all possible cell value types: primitive, null, rich text, hyperlink, formula, shared formula"})


export const cellValueInverse = z.union([
                ...primitiveCellValueInverse.options,
                z.null().meta({description: "Empty cell value"}),
                richTextDef, // CellRichTextValue
                z.object({
                    text: z.string().meta({description: "Hyperlink text. Examples: \"Click here\", \"Google\""}),
                    hyperlink: z.string().url().meta({description: "URL for the hyperlink. Examples: \"https://google.com\", \"mailto:user@example.com\""}),
                    tooltip: z.string().optional().meta({description: "Tooltip text when hovering over link. Examples: \"Visit Google\", \"Send email\""})
                }).meta({description: "Cell hyperlink value with text and URL"}), // CellHyperlinkValue
                z.object({
                    formula: excelFormulaSchema,
                    result: primitiveCellValue
                }).meta({description: "Cell formula with result. Formula starts with \"=\". Examples: {formula: \"=SUM(A1:A10)\", result: 100}"}), // CellFormulaValue
                z.union([z.object({ // Master
                    formula: excelCellReferenceSchema,
                    result: primitiveCellValue,
                    shareType: z.literal('shared').meta({description: "Shared formula type. Always \"shared\""}),
                    ref: excelCellRangeReferenceSchema
                }).meta({description: "Master shared formula across a range"}), z.object({ // Shared
                    sharedFormula: excelCellReferenceSchema,
                    result: primitiveCellValue
                }).meta({description: "Shared formula referencing a master"}), z.object({ // Array
                    formula: excelFormulaSchema,
                    result: primitiveCellValue,
                    shareType: z.literal('array').meta({description: "Array formula type. Always \"array\""}),
                    ref: excelCellRangeReferenceSchema

                })]).meta({description: "Shared or array formula across a cell range"})  // CellSharedFormulaValue
            ]).meta({description: "Inverse union of all possible cell value types for encoding"})