# Blackbox Test Report: my-server (Sheet MCP)

**Test Date:** 2026-07-18  
**Server Version:** js-excel-mcp v4.22.3  
**Platform:** Windows, PowerShell 5.1  
**Method:** Pure blackbox testing - only tool responses observed, no code inspection or log analysis

---

## Bugs Found

### BUG 1 (Critical): Workbooks close immediately after creation

**Observation:** After creating a workbook, it immediately closes, preventing any operations.

**Reproduction (consistent across multiple attempts):**
```
Attempt 1:
create_new_workbook("retest_critical.xlsx")
→ {"filename":"retest_critical.xlsx","status":"created","sheets":["Sheet1"]}
→ context: file: retest_critical.xlsx, sheet: Sheet1

set_cell("A1", "test value")
→ "no workbook is currently open"
→ context: no file selected

Attempt 2:
create_new_workbook("test_immediate.xlsx")
→ {"filename":"test_immediate.xlsx","status":"created","sheets":["Sheet1"]}
→ context: file: test_immediate.xlsx, sheet: Sheet1

list_open_workbook()
→ "files currently open are " (empty list)
→ context: no file selected
```

**Pattern:** Workbook creation succeeds and returns correct context, but by the next tool call, the workbook is gone.

**Impact:** Cannot perform any operations on newly created workbooks. Server is unusable.

**Note:** User reports they cannot reproduce this issue. May be environment-specific or related to MCP connection state.

---

### BUG 2 (Low): `delete_named_range` returns validation error for non-existent range

**Repro:** Call `delete_named_range` with a name that doesn't exist  
**Actual:** `Output validation error: Invalid structured content for tool delete_named_range: action: Invalid input: expected "deleted"`  
**Expected:** Should return a clean error message like "named range not found"

---

### BUG 3 (Low): `insert_image` error message unclear when fetch fails

**Status:** CANNOT TEST - Blocked by BUG 1

**Original issue:** Returns bare `fetch failed` without details  
**Expected:** A more descriptive error message (e.g. which URL failed, HTTP status, timeout info)

**Note:** Cannot verify current behavior because workbooks close before operations can be performed.

---

## Summary

**Critical bugs:** 1 (workbooks close immediately after creation)  
**Low bugs:** 1 confirmed (delete_named_range validation error), 1 blocked (insert_image error message)

**Current Status:** Server is unusable due to critical bug. Cannot complete testing.
