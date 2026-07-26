# Blackbox Test Report: my-server (Sheet MCP)

**Test Date:** 2026-07-18  
**Server Version:** js-excel-mcp v4.22.3  
**Platform:** Windows, PowerShell 5.1  
**Method:** Pure blackbox testing - only tool responses observed, no code inspection or log analysis

---

## Bugs Found

### BUG 1 (Low): `delete_named_range` returns validation error for non-existent range

**Repro:** Call `delete_named_range` with a name that doesn't exist  
**Actual:** `Output validation error: Invalid structured content for tool delete_named_range: action: Invalid input: expected "deleted"`  
**Expected:** Should return a clean error message like "named range not found"

---

### BUG 2 (Low): `insert_image` error message unclear when fetch fails

**Repro:** Call `insert_image` with an unreachable URL  
**Actual:** Returns bare `fetch failed`  
**Expected:** A more descriptive error message (e.g. which URL failed, HTTP status, timeout info)

**Note:** via.placeholder.com no longer exists, so original host-specific finding is a false positive. The only remaining issue is the unhelpful error message.

---

### BUG 3 (Critical): Workbooks close immediately after creation

**Observation:** After creating a workbook, it immediately closes, preventing any operations.

**Reproduction:**
```
create_new_workbook("image_test.xlsx")
→ {"filename":"image_test.xlsx","status":"created","sheets":["Sheet1"]}
→ context: file: image_test.xlsx, sheet: Sheet1

set_cell("A1", "test")
→ "no workbook is currently open"
→ context: no file selected

list_open_workbook()
→ "files currently open are " (empty)
```

**Impact:** Cannot perform any operations on newly created workbooks. Server is in unstable state.

**Note:** This issue was not present in earlier tests. May be related to server restarts or state corruption.

---

## Summary

**Critical bugs:** 1 (workbooks close immediately after creation)  
**Low bugs:** 2 (validation error on delete_named_range, unclear error message on insert_image)
