# Test Findings: layout
- Date: 2026-07-18
- Test file: test/integration/layout.test.ts
- Ran via: npx tsx test/integration/layout.run.ts
- Result: FAIL (2 passed/1 failed)

## Failures
### merge_cells with workbook and sheet parameters
- Error: OpenXmlSchemaError: mergeCells: range A1:B1 overlaps existing merged range A1:C1
  - at mergeCells (node_modules/@office-kit/xlsx/src/worksheet/worksheet.ts:908:13)
  - at Object.cb (src/tools/handleLayout.ts:37:13)
  - at test/integration/layout.test.ts:66:24
- Suspected src cause (DO NOT fix): src/tools/handleLayout.ts:37 — merge_cells handler does not check whether the target range overlaps an existing merged range before issuing the merge. ExcelKit throws on overlap. The test's own "setup" merges A1:C1 (test line 54), then this test tries to merge the overlapping A1:B1, which the library rejects. (Note: this is arguably a test-ordering/design issue, but the aborting behavior is triggered by the library error surfacing from the handler.)
- Notes: baretest aborts on the FIRST failing test, so only this failure is reported; subsequent tests (freeze_panes, set_column_width, set_row_height, error-path, zero-width/height, teardown) did not run. The prior two tests (`setup`, `merge_cells merges a range into a single cell`) passed before the abort.
