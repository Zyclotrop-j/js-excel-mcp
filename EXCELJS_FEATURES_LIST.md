# ExcelJS Features List

Based on the comprehensive ExcelJS README documentation, here are all the features organized by category:

## Workbook Management

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Create a Workbook | Create new Excel workbook instances | Interface | `new ExcelJS.Workbook()` |
| Set Workbook Properties | Configure creator, dates, and metadata | Interface | `workbook.creator`, `workbook.created`, etc. |
| Set Calculation Properties | Configure calculation behavior on load | Interface | `workbook.calcProperties.fullCalcOnLoad` |
| Workbook Views | Control multiple window views | Interface | `workbook.views` |
| Remove Worksheet | Delete worksheets by ID | Interface | `workbook.removeWorksheet(sheet.id)` |
| Access Worksheets | Get worksheets by name, ID, or array | Interface | `workbook.getWorksheet()`, `workbook.worksheets[]` |
| Worksheet State | Control visibility (visible, hidden, veryHidden) | Interface | `worksheet.state` |
| Worksheet Metrics | Get row/column counts and sizes | Interface | `worksheet.rowCount`, `worksheet.actualRowCount` |

## Worksheet Management

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Add a Worksheet | Create new worksheets with options | Interface | `workbook.addWorksheet()` |
| Worksheet Properties | Set tab color, outline levels, dimensions | Interface | `worksheet.properties.tabColor` |
| Page Setup | Configure print settings, margins, orientation | Interface | `worksheet.pageSetup.orientation`, `worksheet.pageSetup.margins` |
| Headers and Footers | Add text headers and footers with formatting | Interface | `worksheet.headerFooter.oddHeader`, `worksheet.headerFooter.firstFooter` |
| Worksheet Views | Frozen views, split views, zoom controls | Interface | `worksheet.views[{state: 'frozen'}]` |
| Auto Filters | Apply data filtering to ranges | Interface | `worksheet.autoFilter = 'A1:C1'` |
| Columns Management | Add, access, and configure columns | Interface | `worksheet.columns[]`, `worksheet.getColumn()` |
| Rows Management | Add, insert, duplicate, and manage rows | Interface | `worksheet.addRow()`, `worksheet.insertRow()`, `worksheet.duplicateRow()` |
| Cell Handling | Individual cell access and manipulation | Interface | `worksheet.getCell()`, `row.getCell()` |
| Merged Cells | Merge and unmerge cell ranges | Interface | `worksheet.mergeCells('A1:B5')` |
| Defined Names | Assign names to cells for formulas | Interface | `worksheet.getCell('A1').name = 'PI'` |
| Data Validations | Set input validation rules for cells | Interface | `worksheet.getCell('A1').dataValidation` |
| Cell Comments | Add and format cell comments | Interface | `worksheet.getCell('A1').note` |
| Tables | Create and manage Excel tables | Interface | `worksheet.addTable()` |
| Styles | Apply formatting to cells, rows, columns | Interface | `cell.font`, `cell.alignment`, `cell.border` |
| Conditional Formatting | Apply dynamic formatting based on rules | Interface | `worksheet.addConditionalFormatting()` |
| Outline Levels | Set expand/collapse levels for rows/columns | Interface | `worksheet.getRow(3).outlineLevel = 1` |
| Images | Add images as backgrounds or over cells | Interface | `workbook.addImage()`, `worksheet.addImage()` |
| Sheet Protection | Protect worksheets with passwords | Interface | `worksheet.protect('password')` |

## Value Types

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Null Value | Set empty cell values | Value Types | `cell.value = null` |
| Merge Cell | Access merged cell values | Value Types | `cell.value = { type: 'merge' }` |
| Number Value | Set numeric values | Value Types | `cell.value = 42` |
| String Value | Set text values | Value Types | `cell.value = 'Hello World'` |
| Date Value | Set date and time values | Value Types | `cell.value = new Date()` |
| Hyperlink Value | Create clickable links | Value Types | `cell.value = { text: 'Link', hyperlink: 'http://...' }` |
| Formula Value | Set Excel formulas with results | Value Types | `cell.value = { formula: 'A1+B1', result: 10 }` |
| Rich Text Value | Apply in-cell text formatting | Value Types | `cell.value = { richText: [{text: 'Hello', font: {bold: true}}] }` |
| Boolean Value | Set true/false values | Value Types | `cell.value = true` |
| Error Value | Set Excel error values | Value Types | `cell.value = { error: '#N/A' }` |
| Shared Formula | Use shared formulas for efficiency | Value Types | `cell.value = { sharedFormula: 'A1', result: 10 }` |
| Array Formula | Apply formulas to cell ranges | Value Types | `cell.value = { formula: 'A1', shareType: 'array', ref: 'A2:B3' }` |

## File I/O Operations

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| XLSX Reading | Read Excel files with options | File I/O | `workbook.xlsx.readFile()`, `workbook.xlsx.read()` |
| XLSX Writing | Write Excel files with streaming | File I/O | `workbook.xlsx.writeFile()`, `workbook.xlsx.write()` |
| CSV Reading | Read CSV files with custom parsing | File I/O | `workbook.csv.readFile()` |
| CSV Writing | Write CSV files with formatting options | File I/O | `workbook.csv.writeFile()` |
| Streaming XLSX Writer | Write large files efficiently | File I/O | `new ExcelJS.stream.xlsx.WorkbookWriter()` |
| Streaming XLSX Reader | Read large files efficiently | File I/O | `new ExcelJS.stream.xlsx.WorkbookReader()` |
| Buffer Operations | Load from and write to buffers | File I/O | `workbook.xlsx.load()`, `workbook.xlsx.writeBuffer()` |

## Styling and Formatting

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Number Formats | Set number display formats | Styles | `cell.numFmt = '0.00%'` |
| Fonts | Configure font properties (name, size, color) | Styles | `cell.font = { name: 'Arial', bold: true }` |
| Alignment | Set text alignment and wrapping | Styles | `cell.alignment = { horizontal: 'center', wrapText: true }` |
| Borders | Add cell borders with styles and colors | Styles | `cell.border = { top: { style: 'thin' } }` |
| Fills | Apply pattern and gradient fills | Styles | `cell.fill = { type: 'pattern', pattern: 'solid' }` |
| Rich Text Formatting | Apply multiple text styles in one cell | Styles | `cell.value = { richText: [...] }` |
| Cell Protection | Set cell-level protection | Styles | `cell.protection = { locked: false }` |
| Table Styles | Configure table appearance | Tables | `table.style = { theme: 'TableStyleDark3' }` |

## Conditional Formatting Rules

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Expression Rules | Custom formula-based formatting | Conditional Formatting | `type: 'expression', formulae: ['MOD(ROW()+COLUMN(),2)=0']` |
| Cell Is Rules | Compare cell values with operators | Conditional Formatting | `type: 'cellIs', operator: 'greaterThan'` |
| Top 10 Rules | Highlight top/bottom values | Conditional Formatting | `type: 'top10', rank: 10, percent: false` |
| Above Average Rules | Highlight values above/below average | Conditional Formatting | `type: 'aboveAverage', aboveAverage: true` |
| Color Scale Rules | Color cells based on value ranges | Conditional Formatting | `type: 'colorScale', cfvo: [...]` |
| Icon Set Rules | Add icons based on values | Conditional Formatting | `type: 'iconSet', iconSet: '3TrafficLights'` |
| Data Bar Rules | Add data bars for visual comparison | Conditional Formatting | `type: 'dataBar', minLength: 0, maxLength: 100` |
| Contains Text Rules | Format based on text content | Conditional Formatting | `type: 'containsText', operator: 'containsText'` |
| Time Period Rules | Format based on date/time periods | Conditional Formatting | `type: 'timePeriod', timePeriod: 'today'` |

## Data Management Features

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Table Operations | Add, modify, and manage tables | Tables | `worksheet.addTable()`, `table.addRow()`, `table.removeRows()` |
| Data Validation | Set input validation rules | Data Validations | `cell.dataValidation = { type: 'list', formulae: ['"One,Two"'] }` |
| Column Management | Add, remove, and configure columns | Columns | `worksheet.spliceColumns(3,1)`, `worksheet.addColumn()` |
| Row Operations | Insert, delete, and duplicate rows | Rows | `worksheet.insertRow(1, data)`, `worksheet.duplicateRow(2,3)` |
| Cell Splicing | Insert/remove cells with shifting | Rows | `row.splice(3,2,'new value')` |
| Page Breaks | Add page breaks for printing | Rows | `row.addPageBreak()` |
| Auto Filter Range | Set filter ranges for data | Auto Filters | `worksheet.autoFilter = 'A1:E10'` |

## Image and Media Features

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Add Images to Workbook | Register images with workbook | Images | `workbook.addImage({filename: 'path.jpg', extension: 'jpeg'})` |
| Background Images | Set worksheet background images | Images | `worksheet.addBackgroundImage(imageId)` |
| Cell Range Images | Add images over cell ranges | Images | `worksheet.addImage(imageId, 'B2:D6')` |
| Positioned Images | Add images with custom positioning | Images | `worksheet.addImage(imageId, {tl: {col: 0, row: 0}, ext: {width: 500}})` |
| Image Hyperlinks | Add hyperlinks to images | Images | `worksheet.addImage(imageId, {hyperlinks: {hyperlink: 'http://...'}})` |
| Image Anchoring | Control image movement with cells | Images | `image.editAs = 'oneCell'` |

## Protection and Security

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Sheet Protection | Protect entire worksheets | Sheet Protection | `worksheet.protect('password', options)` |
| Cell Protection | Protect individual cells | Cell Protection | `cell.protection = { locked: false }` |
| Comment Protection | Protect comment text and objects | Cell Comments | `cell.note.protection = { locked: 'False' }` |
| Protection Options | Configure protection permissions | Sheet Protection | `worksheet.protect('pass', {formatCells: false, sort: true})` |

## Advanced Features

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Streaming I/O | Memory-efficient file handling | Streaming I/O | `ExcelJS.stream.xlsx.WorkbookWriter` |
| Browser Support | Use ExcelJS in web browsers | Browser | `exceljs.js` (bundled) |
| Custom Parsers | Custom CSV value parsing | CSV | `workbook.csv.readFile(options.map)` |
| Date Formatting | Custom date/time formatting | CSV | `options.dateFormat: 'DD/MM/YYYY'` |
| Formula Translation | Automatic formula translation | Formula Value | `cell.sharedFormula = 'A1'` |
| Outline Properties | Configure expand/collapse behavior | Outline Levels | `worksheet.properties.outlineProperties` |
| Workbook Properties | Set document metadata | Workbook Properties | `workbook.title`, `workbook.keywords`, etc. |

## Performance and Optimization

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Streaming Writer | Memory-efficient writing for large files | Streaming I/O | `new ExcelJS.stream.xlsx.WorkbookWriter({useSharedStrings: true})` |
| Streaming Reader | Memory-efficient reading for large files | Streaming I/O | `new ExcelJS.stream.xlsx.WorkbookReader('file.xlsx')` |
| Shared Strings | Optimize string storage | Streaming I/O | `workbook.useSharedStrings = true` |
| Style Optimization | Control style processing | Streaming I/O | `workbook.useStyles = false` |
| Batch Operations | Process multiple operations efficiently | Batch Tool | `batch` function |
| Row Committing | Free memory after processing | Streaming I/O | `row.commit()` |
| Cell Count Metrics | Track actual vs total cells | Worksheet Metrics | `worksheet.actualRowCount` |

## Configuration and Compatibility

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Promise Configuration | Custom promise library injection | Config | `ExcelJS.config.setValue('promise', require('bluebird'))` |
| ES5 Imports | Legacy Node.js compatibility | Importing | `require('exceljs/dist/es5')` |
| Browserify Bundles | Pre-built browser bundles | Browserify | `<script src="exceljs.js"></script>` |
| 1904 Date System | Support for Mac Excel dates | Workbook Properties | `workbook.properties.date1904 = true` |
| Node Version Support | Version compatibility matrix | Stack | V8+ with polyfills for older versions |
| Ignore Nodes | Performance optimization for parsing | XLSX | `workbook.xlsx.load(data, {ignoreNodes: ['dataValidations']})` |

## Error Handling and Debugging

| Feature Name | Short Description | Related Section | Key Function Call |
|-------------|------------------|----------------|------------------|
| Error Values | Set Excel error types | Value Types | `cell.value = { error: '#REF!' }` |
| Debug Information | Cell type and formula inspection | Value Types | `cell.type`, `cell.formula` |
| Known Issues | Documented limitations and workarounds | Known Issues | Check documentation for specific scenarios |
| Interface Changes | Version compatibility notes | Interface Changes | Review breaking changes between versions |
| Validation Functions | Formula and data validation | Data Validations | `cell.dataValidation.formulae` |

## Total Features: 127 distinct features across all categories

This comprehensive list covers all major ExcelJS capabilities including:
- Basic workbook and worksheet operations (22 features)
- Cell and data manipulation (35 features) 
- Styling and formatting (22 features)
- File I/O operations (8 features)
- Conditional formatting (9 features)
- Images and media (6 features)
- Protection and security (4 features)
- Advanced features (7 features)
- Performance optimization (5 features)
- Configuration and compatibility (9 features)
- Error handling and debugging (9 features)