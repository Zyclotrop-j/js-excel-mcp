export const mcpName = "Sheet MCP";
export const mcpTitle = "Excel Sheet Operations";
export const mcpVersion = '1.0.0';
export const mcpDescription = "Programmatic read, edit, format, chart, and export of Excel (.xlsx) workbooks through a stateful session of file -> sheet -> cell operations.";
export const mcpInstructions = `Sheet MCP lets you work with .xlsx files by calling tools. The server keeps a little bit of sticky state for you — use it.

## Sticky state — read this first

The server remembers three things across calls and echoes them in every response under a "context" block:

- **currentFile** — which open workbook you are in
- **currentSheet** — which worksheet of that workbook is active
- **currentCell** — which cell on that sheet is the cursor

Because of this, the "workbook", "sheet", and cell-ref fields on most tools are OPTIONAL. Omit them and the server uses whichever file/sheet/cell you last touched. This is true for nearly every tool here.

Tool calls that touch a cell update the cursor automatically, so you can chain operations without re-naming the target each time. Always glance at the response "context" block to confirm where you are.

- \`set_context\` — explicitly set workbook / sheet / cell without doing an operation. Useful before a chained operation or to echo current context with no args. Each field is optional; sheet requires its workbook active (or being set in the same call), cell requires its sheet active (or being set in the same call).

## Batching with \`chain_operations\`

\`chain_operations\` dispatches a list of tool calls sequentially, sharing the sticky file/sheet/cell context across steps (later steps see state changes from earlier ones). Each step's result is streamed back via a logging notification as it happens, and the final result aggregates status / text / structuredContent for every step.

Use it when round-trips dominate latency: a 10-step write-then-read chain completes in ~1s instead of ~10s of sequential \`tools/call\`s. Pass \`stopOnError: true\` (the default) to halt on the first error or \`false\` to run all steps and collect failures.

**One restriction**: \`chain_operations\` cannot invoke tools that require MCP sampling. If a step calls \`detect_headers\` with \`useSampling: true\` (the default), the step errors with "tool requires client input (sampling) and cannot be used inside a chain". Pass \`useSampling: false\` on the step args, or call \`detect_headers\` outside the chain first and let the chain reuse its cached result.

## Typical workflow

### 1. Get a workbook into the session

- \`create_new_workbook\` — make a fresh empty workbook. \`createDefaultWorksheet\` accepts \`true\` (creates "Sheet1"), \`false\` (no sheet), or a string (custom sheet name). Default is "Sheet1".
- \`import_workbook_from_url\` — fetch an existing .xlsx from a URL

Either one sets the new workbook as currentFile. \`list_open_workbook\` shows what's already loaded.

### 2. Pick the sheet you want

- \`list_sheets\` — see what's in the workbook
- \`select_sheet\` — switch to an existing one
- \`create_sheet\` — make and activate a new one
- \`rename_sheet\` / \`delete_sheet\` / \`copy_sheet\` / \`move_sheet\` — restructure

Each one updates currentSheet. From here on out, you usually don't need to pass "sheet" again.

### 3. Read and modify cell data

Every cell tool updates currentCell to the cell you touched, so the cursor follows you and you usually don't need to re-target on the next call.

#### 3a. Known tables — you already know where the data lives

- \`get_cell\` — single value when you know the exact A1 ref (e.g. "C5") or row+col. The \`value\` field returns the most natural JS value for the cell type: primitives pass through; error cells return \`{kind: 'error', code}\`; duration cells return \`{kind: 'duration', ms}\`; rich-text returns \`{kind: 'rich-text', runs: [...]}\`; formula cells return \`{kind: 'formula', formula, cachedValue?}\` — check \`cachedValue\` for the cached result (may be absent when the formula hasn't been evaluated). \`nativeValue\` carries the same structured value (Date cells ISO-stringified), and \`formula\` is the formula text or null.
- \`get_range\` — pull an entire 2D block in one shot (e.g. "A1:E100"). Use this when the data is structured: header in row 1, rows below, columns left to right. One call returns the whole table.

#### 3b. Explore — find the data first

Use these when the layout is unfamiliar, the data is somewhere loose on the sheet, or you're scanning.

- \`search_cells\` — find cells containing a given string anywhere in the worksheet; returns each hit with its A1 ref, value, and any formula
- \`detect_headers\` — find header bands (top, left, or both). **For best detection, leave \`useSampling\` at its default \`true\`** — the host LLM is consulted via MCP sampling and given row + column samples; it ignores title rows, understands field names like "Name" vs data values like "Tom", and reports both the start and end of the header band via a structured tool call. If the host doesn't support sampling (or you pass \`useSampling: false\`), a **smart heuristic** takes over: it checks structural signals (Excel tables, autoFilter, freeze panes), cell formatting (bold fonts, solid fills, bottom borders), and type-pattern contrast (e.g. all-string header rows vs mixed-type data rows below). You can bypass detection entirely with \`headerStartRow\` / \`headerRows\` / \`headerStartCol\` / \`headerCols\` (headerRows=0 = no headers on that axis). Detection is tuned by \`scanDepth\` (rows/columns scanned, default 20), \`sampleWidth\` (cells per row/column sampled to the LLM, default 30), and \`returnWidth\` (cells per row/column in the returned band values, default 30). Results include a \`hasHeaders\` boolean, the bands, the values inside them, a \`source\` field (sampling / heuristic / manual), and an \`explanation\`. Results are cached in SQLite keyed by file+sheet+params with a content fingerprint, so repeated calls skip re-detection.
- \`get_sample\` — runs \`detect_headers\` automatically, then returns a TOON-encoded N×N grid (default 10×10) of the data area just after the headers. The structured output includes \`hasHeaders\`, \`headerSource\`, and \`explanation\` so the caller can tell whether the data window starts after real headers or defaults to A1. Accepts the same \`scanDepth\` / \`sampleWidth\` / \`returnWidth\` / \`useSampling\` knobs plus \`headerStartRow\` / \`headerRows\` / \`headerStartCol\` / \`headerCols\` for manual override.
- \`get_row_sample\` — runs \`detect_headers\` automatically, then returns N cells (default 10) of a single data row, alongside the horizontal headers as labels. Includes \`hasHeaders\` / \`headerSource\` / \`explanation\` in structured output. Accepts the same detection knobs plus manual override params.
- \`get_column_sample\` — runs \`detect_headers\` automatically, then returns N cells (default 10) of a single data column with the column's header name. Includes \`hasHeaders\` / \`headerSource\` / \`explanation\` in structured output. Accepts the same detection knobs plus manual override params.
- \`move_cell_cursor\` — walk up / down / left / right OR JUMP directly to a cell with \`direction: "jump"\` + \`target: "A1"\` (or \`{ row, col }\`), OR JUMP back to the cell the cursor was on when this tool call started with \`direction: "jump-to-original"\`. Each step uses either a fixed count or a stopping condition: UNTIL_BLANK, UNTIL_ERROR, a value compare (\`=\`, \`!=\`, \`>\`, \`<\`, \`>=\`, \`<=\` against a string / number / boolean), a regex pattern, or a date compare (against an ISO date). Each step can also carry an optional \`max\` cap so a condition-stopped move terminates after N cells even if the condition never fires (e.g. "move up UNTIL_BLANK, but at most 100 cells" — sets \`max: 100\`). Every visited cell is reported, so use it to crawl a column or row until you hit a blank / error / value, then \`get_cell\` on anything interesting.

  \`jump-to-original\` is the book-end of \`jump\`: jump to a known cell, do some exploration, then return to the cell you started at so any subsequent cell operation lands back where you began.

  **Example — scan two populated columns from your current cell in one tool call.** Crawl down UNTIL_BLANK with a safety cap, snap back to the top, step right, crawl the next column, then snap back to where you started:

  \`\`\`
  moves: [
    { "direction": "down",  "count": "UNTIL_BLANK", "max": 100 },
    { "direction": "jump-to-original" },
    { "direction": "right", "count": 1 },
    { "direction": "down",  "count": "UNTIL_BLANK", "max": 100 },
    { "direction": "jump-to-original" }
  ]
  \`\`\`

  Each \`down\` crawls UNTIL_BLANK with a 100-cell safety cap, so a totally-empty column terminates with \`max_reached\` rather than running to the worksheet edge; each \`jump-to-original\` snaps the cursor back to the top so the next \`right\` + \`down\` starts the next column. The final \`jump-to-original\` returns the cursor to wherever it was when this call started — so a follow-up \`get_cell\` (or any cell tool that uses the cursor) lands back at the original position regardless of how far the crawl wandered. Extend the pattern with more \`right\` + \`down\` + \`jump-to-original\` triples to scan more columns.

#### 3c. Create / write

- \`set_cell\` — write a single value (string / number / boolean / null / error) at an A1 ref or row+col. Error values are \`{kind: 'error', code}\` with code one of \`#NULL!\`, \`#DIV/0!\`, \`#VALUE!\`, \`#REF!\`, \`#NAME?\`, \`#NUM!\`, \`#N/A\`, \`#GETTING_DATA\`.
- \`set_cells\` — bulk-write a 2D array of values starting at a top-left range anchor. Use this for full-table writes; it's one call instead of many.
- \`set_formula\` — write a formula like \`=SUM(A1:A10)\`. Pass a cached value when you can (\`setFormula(cell, formula, { cachedValue: ... })\`); the file then renders the result before Excel is forced to recalc on open. The structured response includes a \`warnings: string[]\` array (and a \`(warning: ...)\` note in the text) when the formula directly self-references the target cell — e.g. \`=E14/D14-1\` on cell \`E14\` — or includes it inside a range. The write still goes through; the warning lets you notice and correct the formula on a follow-up call.
- \`set_cell_type\` — coerce an already-written text cell into number / currency / percent / date / text / boolean. Useful when numeric data came in as text (e.g. pasted from a CSV) and you need it to sort / sum correctly.

### 4. Make it look right

**Styling**: \`set_cell_bold\`, \`set_cell_font\` (size/name/color), \`set_cell_background_color\`, \`set_cell_alignment\` (horizontal/vertical/wrapText), \`set_cell_border\`

**Number formats**: \`set_cell_currency\` (pick the symbol and decimals), \`set_cell_percent\`, \`set_cell_date_format\` (date/datetime/time), \`set_cell_number_format\` (custom Excel format string like "#,##0.00")

**Layout**: \`merge_cells\` (join a range like "A1:E1"), \`freeze_panes\` (the cell ref is the first non-frozen cell after the freeze line), \`set_column_width\`, \`set_row_height\`

**Clickable cells**: \`set_cell_hyperlink\` (URL on a cell)

**Input control**: \`add_dropdown_validation\` (list of allowed values), \`add_number_validation\` (min/max bounds)

**Visual rules**: \`add_color_scale\` (3-color heat-map across a range), \`add_cell_value_rule\` (highlight cells greater/less than, equal, or between values). \`value\` / \`value2\` accept string / number / boolean and are coerced to string internally — so \`value: 70000\` works for "greater than 70000". Pass \`fillColor: "FFFF6B6B"\` in AARRGGBB to set the highlight color; without it the rule still fires but applies no fill.

**Structured tables**: \`create_excel_table\` (banded rows + built-in filter headers + named for formula reference — if a sheet-level autoFilter already covers the exact same range it is cleared and absorbed into the table, since Excel would otherwise discard the table on open; the structured response reports \`clearedAutoFilter: true\` when this happens. Do NOT pair \`add_autofilter\` with \`create_excel_table\` on the same range — the table already brings its own filter), \`add_autofilter\` (filter dropdowns without the full table styling)

**Mixed formatting in one cell**: \`set_rich_text\` — pass an array of { text, bold?, italic?, fontSize?, fontColor?, fontName? } parts

**Collapsible sections**: \`group_rows\` / \`group_columns\` — outline groups

**Annotations**: \`add_comment\` / \`delete_comment\` — sticky-note style comments on cells

**Lock-down**: \`protect_sheet\` (enable/disable sheet protection), \`lock_cell\` (toggle lock on a specific cell; auto-creates the cell if missing, mirroring \`set_cell\`)

### 5. Visualizations and assets

- \`add_bar_chart\` / \`add_line_chart\` — anchored to a cell; dataRange is an A1 range ON THE SAME SHEET
- \`insert_image\` — fetches an image from a URL and drops it at a cell anchor

### 6. Workbook-level features

- \`add_named_range\` (e.g. "Revenue" -> "Sheet1!$B$2:$B$100") — use across formulas; \`delete_named_range\`
- \`set_print_area\` (which range prints); \`set_page_setup\` (orientation/paperSize/fitToWidth/fitToHeight/scale)

### 7. Save or close

- \`export_workbook_to_url\` — returns a download URL with a TTL. Pass \`autoclose: true\` to drop the workbook from the session at the same time.
- \`close_workbook\` — drop a workbook without exporting. \`filename\` is optional and defaults to the current workbook.

## Resources

Open workbooks are also exposed as MCP resources under the URI scheme \`workbook://{filename}\`. You can read them to get the raw .xlsx bytes if you need to inspect, archive, or hand the file off to something else.

## Gotchas

- **Cell refs**: every cell tool accepts a "ref" (A1 string), "row" + "col" (1-indexed), or falls back to currentCell. Pick whichever is cleanest for the call you're making.
- **Colors**: hex strings are \`AARRGGBB\` — the leading two chars are alpha. Opaque red is \`FFFF0000\`, half-transparent blue is \`80FF0000\`, fully transparent (no fill) is \`00000000\`.
- **Currency symbols**: pass the character you want, e.g. "$", "EUR", "YEN". The cell value stays a plain number; Excel / the consumer renders the symbol.
- **Formula cached values** are optional but cheap — pass them if you can, so files look correct in tools that don't recalculate on open.
- **Many tools return TOON** (a compact token-efficient encoding) for ranges and search results so they fit cheaply in your context.
- **Styling functions pool styles per workbook**. That means setting bold on ten thousand cells is essentially free storage-wise after the first one — it just references the existing bold style.
- **Charts and images are anchored to a cell**, not floats — they live with the workbook and don't require an extra drawing part configuration from you.
- **\`createDefaultWorksheet: "false"\` (string) suppresses sheet creation** despite being truthy — the handler treats the literal string \`"false"\` the same as the boolean \`false\`. Pass \`false\` (boolean) for "no sheet", or any other string to name the sheet. Don't pass \`"false"\` thinking you're naming a sheet.
- **\`chain_operations\` cannot invoke tools that require MCP sampling** — when \`detect_headers\` or its sample derivatives are called with \`useSampling: true\` inside a chain, the step errors with "tool requires client input (sampling) and cannot be used inside a chain". Pass \`useSampling: false\` on the step args, or call \`detect_headers\` outside the chain first and let the chain reuse its cached result.
- **Persistence model**: each \`tools/call\` persists its writes immediately, so state is consistent across calls in a batch or SSE stream. \`chain_operations\` is the one exception — it batches internally for performance (a 10-step chain takes ~1s instead of ~10s), and its writes persist at HTTP-request completion, not after each step. A crash between standalone \`tools/call\`s loses nothing; a crash mid-chain loses the chain's unflushed writes.
- **Every tool call round-trips the workbook through bytes.** \`Context.setWorkbook\` serialises to .xlsx bytes on each call and \`Context.getWorkbook\` re-parses them on the next call. Anything that does not survive a save→load cycle (e.g. raw XML stuffed into a field the parser doesn't model) is silently lost. Prefer first-class schema fields over hand-rolled XML payloads; if you must hand-roll XML, verify it round-trips by calling \`get_cell\` / \`get_range\` afterwards.
- **Self-referential formulas are written as-is.** \`set_formula\` does not block \`=E14/D14-1\` on cell \`E14\` — Excel accepts it and surfaces it in its circular-reference dialog. The server's structured response includes a \`warnings\` array when this happens so you can correct the formula on a follow-up call. Watch for it whenever a formula's target cell also appears in its body, especially in "growth" / "delta" columns where row indices are easy to misalign.`;
