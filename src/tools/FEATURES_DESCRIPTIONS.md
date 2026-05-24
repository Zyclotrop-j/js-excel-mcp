# ExcelJS Features - Tool Descriptions

This file contains all 127 ExcelJS features organized by category with descriptions.

## Workbook Management (7 features)

### src/tools/workbook/createWorkbookTool.ts
- Feature: Create a Workbook
- Description: Create a new Excel workbook with optional properties configuration.

### src/tools/workbook/setWorkbookPropertiesTool.ts
- Feature: Set Workbook Properties
- Description: Set workbook properties like creator, dates, metadata, and calculation properties.

### src/tools/workbook/setCalcPropertiesTool.ts
- Feature: Set Calculation Properties
- Description: Configure calculation behavior on load for the workbook.

### src/tools/workbook/workbookViewsTool.ts
- Feature: Workbook Views
- Description: Control multiple workbook window views and display settings.

### src/tools/workbook/removeWorksheetTool.ts
- Feature: Remove Worksheet
- Description: Remove a worksheet from the workbook by worksheet ID.

### src/tools/workbook/accessWorksheetsTool.ts
- Feature: Access Worksheets
- Description: Access worksheets by name, ID, or list all worksheets in the workbook.

### src/tools/workbook/worksheetStateTool.ts
- Feature: Worksheet State
- Description: Control worksheet visibility state (visible, hidden, veryHidden).

## Worksheet Management (18 features)

### src/tools/worksheet/addWorksheetTool.ts
- Feature: Add a Worksheet
- Description: Create new worksheets with options including name, properties, and views.

### src/tools/worksheet/worksheetPropertiesTool.ts
- Feature: Worksheet Properties
- Description: Set worksheet properties including tab color, outline levels, and dimensions.

### src/tools/worksheet/pageSetupTool.ts
- Feature: Page Setup
- Description: Configure print settings, margins, orientation, and page layout options.

### src/tools/worksheet/headersFootersTool.ts
- Feature: Headers and Footers
- Description: Set worksheet headers and footers with formatting and content.

### src/tools/worksheet/autoFilterTool.ts
- Feature: Auto Filters
- Description: Apply auto filters to worksheet data ranges.

### src/tools/worksheet/columnsTool.ts
- Feature: Columns
- Description: Add column headers and define column keys and widths for worksheets.

### src/tools/worksheet/rowsTool.ts
- Feature: Rows
- Description: Get, add, insert, and manage rows in worksheets.

### src/tools/worksheet/cellHandlingTool.ts
- Feature: Handling Individual Cells
- Description: Access and modify individual cell values in worksheets.

### src/tools/worksheet/mergedCellsTool.ts
- Feature: Merged Cells
- Description: Merge and unmerge cell ranges in worksheets.

### src/tools/worksheet/insertRowsTool.ts
- Feature: Insert Rows
- Description: Insert rows at specific positions with data.

### src/tools/worksheet/spliceTool.ts
- Feature: Splice
- Description: Cut/remove rows or cells and optionally insert new ones.

### src/tools/worksheet/duplicateRowTool.ts
- Feature: Duplicate a Row
- Description: Duplicate rows with options for insert or replace.

### src/tools/worksheet/definedNamesTool.ts
- Feature: Defined Names
- Description: Assign names to cells for use in formulas.

### src/tools/worksheet/dataValidationsTool.ts
- Feature: Data Validations
- Description: Set input validation rules for cells (list, whole, decimal, etc.).

### src/tools/worksheet/cellCommentsTool.ts
- Feature: Cell Comments
- Description: Add and format cell comments with rich text support.

### src/tools/worksheet/tablesTool.ts
- Feature: Tables
- Description: Create and manage Excel tables with headers, totals, and styles.

### src/tools/worksheet/stylesTool.ts
- Feature: Styles
- Description: Apply formatting to cells, rows, columns (numFmt, font, alignment, border, fill).

### src/tools/worksheet/conditionalFormattingTool.ts
- Feature: Conditional Formatting
- Description: Apply dynamic formatting based on rules (expression, cellIs, top10, etc.).

### src/tools/worksheet/outlineLevelsTool.ts
- Feature: Outline Levels
- Description: Set expand/collapse levels for rows and columns.

### src/tools/worksheet/imagesTool.ts
- Feature: Images
- Description: Add images as backgrounds or over cell ranges.

### src/tools/worksheet/sheetProtectionTool.ts
- Feature: Sheet Protection
- Description: Protect worksheets with passwords and configure permissions.

## Value Types (10 features)

### src/tools/valueTypes/nullValueTool.ts
- Feature: Null Value
- Description: Set empty cell values.

### src/tools/valueTypes/mergeCellTool.ts
- Feature: Merge Cell
- Description: Access merged cell values.

### src/tools/valueTypes/numberValueTool.ts
- Feature: Number Value
- Description: Set numeric values in cells.

### src/tools/valueTypes/stringValueTool.ts
- Feature: String Value
- Description: Set text values in cells.

### src/tools/valueTypes/dateValueTool.ts
- Feature: Date Value
- Description: Set date and time values in cells.

### src/tools/valueTypes/hyperlinkValueTool.ts
- Feature: Hyperlink Value
- Description: Create clickable links with text and tooltip.

### src/tools/valueTypes/formulaValueTool.ts
- Feature: Formula Value
- Description: Set Excel formulas with results.

### src/tools/valueTypes/richTextValueTool.ts
- Feature: Rich Text Value
- Description: Apply in-cell text formatting with multiple styles.

### src/tools/valueTypes/booleanValueTool.ts
- Feature: Boolean Value
- Description: Set true/false values in cells.

### src/tools/valueTypes/errorValueTool.ts
- Feature: Error Value
- Description: Set Excel error values (#N/A, #REF!, etc.).

## File I/O Operations (8 features)

### src/tools/fileIO/xlsxReadTool.ts
- Feature: XLSX Reading
- Description: Read Excel files with options and load into workbook.

### src/tools/fileIO/xlsxWriteTool.ts
- Feature: XLSX Writing
- Description: Write Excel files with buffering and streaming support.

### src/tools/fileIO/csvReadTool.ts
- Feature: CSV Reading
- Description: Read CSV files with custom parsing and date formats.

### src/tools/fileIO/csvWriteTool.ts
- Feature: CSV Writing
- Description: Write CSV files with formatting and custom mapping.

### src/tools/fileIO/streamingXlsxWriterTool.ts
- Feature: Streaming XLSX Writer
- Description: Write large Excel files efficiently with streaming.

### src/tools/fileIO/streamingXlsxReaderTool.ts
- Feature: Streaming XLSX Reader
- Description: Read large Excel files efficiently with streaming.

### src/tools/fileIO/bufferOperationsTool.ts
- Feature: Buffer Operations
- Description: Load from and write to buffers.

### src/tools/fileIO/streamingIOTool.ts
- Feature: Streaming I/O
- Description: Memory-efficient file handling for large workbooks.

## Styling and Formatting (8 features)

### src/tools/styling/numberFormatsTool.ts
- Feature: Number Formats
- Description: Set number display formats (percentage, currency, etc.).

### src/tools/styling/fontsTool.ts
- Feature: Fonts
- Description: Configure font properties (name, size, color, bold, italic).

### src/tools/styling/alignmentTool.ts
- Feature: Alignment
- Description: Set text alignment, wrapping, and rotation.

### src/tools/styling/bordersTool.ts
- Feature: Borders
- Description: Add cell borders with styles and colors.

### src/tools/styling/fillsTool.ts
- Feature: Fills
- Description: Apply pattern and gradient fills to cells.

### src/tools/styling/richTextTool.ts
- Feature: Rich Text Formatting
- Description: Apply multiple text styles in one cell.

### src/tools/styling/cellProtectionTool.ts
- Feature: Cell Protection
- Description: Set cell-level protection (locked, hidden).

### src/tools/styling/tableStylesTool.ts
- Feature: Table Styles
- Description: Configure table appearance (theme, stripes, etc.).

## Conditional Formatting Rules (9 features)

### src/tools/conditionalFormatting/expressionRulesTool.ts
- Feature: Expression Rules
- Description: Custom formula-based formatting rules.

### src/tools/conditionalFormatting/cellIsRulesTool.ts
- Feature: Cell Is Rules
- Description: Compare cell values with operators.

### src/tools/conditionalFormatting/top10RulesTool.ts
- Feature: Top 10 Rules
- Description: Highlight top/bottom values.

### src/tools/conditionalFormatting/aboveAverageRulesTool.ts
- Feature: Above Average Rules
- Description: Highlight values above/below average.

### src/tools/conditionalFormatting/colorScaleRulesTool.ts
- Feature: Color Scale Rules
- Description: Color cells based on value ranges.

### src/tools/conditionalFormatting/iconSetRulesTool.ts
- Feature: Icon Set Rules
- Description: Add icons based on values.

### src/tools/conditionalFormatting/dataBarRulesTool.ts
- Feature: Data Bar Rules
- Description: Add data bars for visual comparison.

### src/tools/conditionalFormatting/containsTextRulesTool.ts
- Feature: Contains Text Rules
- Description: Format based on text content.

### src/tools/conditionalFormatting/timePeriodRulesTool.ts
- Feature: Time Period Rules
- Description: Format based on date/time periods.

## Data Management Features (9 features)

### src/tools/dataManagement/tableOperationsTool.ts
- Feature: Table Operations
- Description: Add, modify, and manage Excel tables.

### src/tools/dataManagement/dataValidationTool.ts
- Feature: Data Validation
- Description: Set input validation rules for cells.

### src/tools/dataManagement/columnManagementTool.ts
- Feature: Column Management
- Description: Add, remove, and configure columns.

### src/tools/dataManagement/rowOperationsTool.ts
- Feature: Row Operations
- Description: Insert, delete, and duplicate rows.

### src/tools/dataManagement/cellSplicingTool.ts
- Feature: Cell Splicing
- Description: Insert/remove cells with shifting.

### src/tools/dataManagement/pageBreaksTool.ts
- Feature: Page Breaks
- Description: Add page breaks for printing.

### src/tools/dataManagement/autoFilterRangeTool.ts
- Feature: Auto Filter Range
- Description: Set filter ranges for data.

### src/tools/dataManagement/addRowsTool.ts
- Feature: Add Rows
- Description: Add rows by key-value, array, or object.

### src/tools/dataManagement/getRowsTool.ts
- Feature: Get Rows
- Description: Get multiple row objects from worksheet.

## Image and Media Features (6 features)

### src/tools/images/addImagesToWorkbookTool.ts
- Feature: Add Images to Workbook
- Description: Register images with workbook by filename or buffer.

### src/tools/images/backgroundImagesTool.ts
- Feature: Background Images
- Description: Set worksheet background images.

### src/tools/images/cellRangeImagesTool.ts
- Feature: Cell Range Images
- Description: Add images over cell ranges.

### src/tools/images/positionedImagesTool.ts
- Feature: Positioned Images
- Description: Add images with custom positioning.

### src/tools/images/imageHyperlinksTool.ts
- Feature: Image Hyperlinks
- Description: Add hyperlinks to images.

### src/tools/images/imageAnchoringTool.ts
- Feature: Image Anchoring
- Description: Control image movement with cells.

## Protection and Security (4 features)

### src/tools/protection/sheetProtectionTool.ts
- Feature: Sheet Protection
- Description: Protect entire worksheets with passwords.

### src/tools/protection/cellProtectionTool.ts
- Feature: Cell Protection
- Description: Protect individual cells.

### src/tools/protection/commentProtectionTool.ts
- Feature: Comment Protection
- Description: Protect comment text and objects.

### src/tools/protection/protectionOptionsTool.ts
- Feature: Protection Options
- Description: Configure protection permissions (formatCells, sort, etc.).

## Advanced Features (7 features)

### src/tools/advanced/streamingIOTool.ts
- Feature: Streaming I/O
- Description: Memory-efficient file handling for large workbooks.

### src/tools/advanced/browserSupportTool.ts
- Feature: Browser Support
- Description: Use ExcelJS in web browsers.

### src/tools/advanced/customParsersTool.ts
- Feature: Custom Parsers
- Description: Custom CSV value parsing with mapping functions.

### src/tools/advanced/dateFormattingTool.ts
- Feature: Date Formatting
- Description: Custom date/time formatting for CSV operations.

### src/tools/advanced/formulaTranslationTool.ts
- Feature: Formula Translation
- Description: Automatic formula translation for shared formulas.

### src/tools/advanced/outlinePropertiesTool.ts
- Feature: Outline Properties
- Description: Configure expand/collapse behavior.

### src/tools/advanced/workbookPropertiesTool.ts
- Feature: Workbook Properties
- Description: Set document metadata (title, subject, keywords, etc.).

## Performance and Optimization (5 features)

### src/tools/performance/streamingWriterTool.ts
- Feature: Streaming Writer
- Description: Memory-efficient writing for large files.

### src/tools/performance/streamingReaderTool.ts
- Feature: Streaming Reader
- Description: Memory-efficient reading for large files.

### src/tools/performance/sharedStringsTool.ts
- Feature: Shared Strings
- Description: Optimize string storage.

### src/tools/performance/styleOptimizationTool.ts
- Feature: Style Optimization
- Description: Control style processing performance.

### src/tools/performance/batchOperationsTool.ts
- Feature: Batch Operations
- Description: Process multiple operations efficiently.

## Configuration and Compatibility (9 features)

### src/tools/configuration/promiseConfigurationTool.ts
- Feature: Promise Configuration
- Description: Custom promise library injection.

### src/tools/configuration/es5ImportsTool.ts
- Feature: ES5 Imports
- Description: Legacy Node.js compatibility.

### src/tools/configuration/browserifyBundlesTool.ts
- Feature: Browserify Bundles
- Description: Pre-built browser bundles.

### src/tools/configuration/1904DateSystemTool.ts
- Feature: 1904 Date System
- Description: Support for Mac Excel dates.

### src/tools/configuration/nodeVersionSupportTool.ts
- Feature: Node Version Support
- Description: Version compatibility matrix.

### src/tools/configuration/ignoreNodesTool.ts
- Feature: Ignore Nodes
- Description: Performance optimization for parsing.

### src/tools/configuration/configTool.ts
- Feature: Config
- Description: ExcelJS configuration settings.

### src/tools/configuration/knownIssuesTool.ts
- Feature: Known Issues
- Description: Documented limitations and workarounds.

### src/tools/configuration/interfaceChangesTool.ts
- Feature: Interface Changes
- Description: Version compatibility notes.

## Error Handling and Debugging (9 features)

### src/tools/errorHandling/errorValuesTool.ts
- Feature: Error Values
- Description: Set Excel error types.

### src/tools/errorHandling/debugInformationTool.ts
- Feature: Debug Information
- Description: Cell type and formula inspection.

### src/tools/errorHandling/knownIssuesTool.ts
- Feature: Known Issues
- Description: Documented limitations and workarounds.

### src/tools/errorHandling/validationFunctionsTool.ts
- Feature: Validation Functions
- Description: Formula and data validation.

### src/tools/errorHandling/interfaceChangesTool.ts
- Feature: Interface Changes
- Description: Review breaking changes between versions.

### src/tools/errorHandling/cellTypeTool.ts
- Feature: Cell Type
- Description: Get cell type and value type information.

### src/tools/errorHandling/formulaTool.ts
- Feature: Formula
- Description: Get and set cell formulas.

### src/tools/errorHandling/resultTool.ts
- Feature: Result
- Description: Get formula calculation results.

### src/tools/errorHandling/effeciveTypeTool.ts
- Feature: Effective Type
- Description: Get cell effective type after formula evaluation.

---
Total: 127 features across 12 categories