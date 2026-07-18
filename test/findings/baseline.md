# Baseline Test Results
- Date: 2026-07-18
- unit:        FAIL (0/1 visible) — baretest aborts on first failure; 82 tests registered, 1 assertion failure surfaced
- integration: FAIL (0/1 visible) — baretest aborts on first failure; 92 tests registered, 1 assertion failure surfaced
- e2e:         FAIL (0/1 visible) — baretest aborts on first failure; 47 tests registered, 1 assertion failure surfaced
- property:    FAIL (0/1 visible) — baretest aborts on first failure; 58 tests registered, 1 property failure surfaced (exit code 1)

> NOTE on counts: The `baretest` runner prints a single gray dot per passing test and a red `! <name>` on
> failure, then **returns/aborts the whole suite on the first failing test** (it never reaches the final
> `✓ <total>` tally). Therefore a single run can only ever surface ONE failure per suite. The `<passed>`
> count above is 0 because no suite completed; the per-suite *total registered tests* is given for context
> (this is the number baretest would print as `✓ N` on a fully-passing run). Real totals:
> unit=82, integration=92, e2e=47, property=58. Each suite still **compiled and executed** — these are
> genuine test failures, not setup/compile errors.

## First failing test per suite (the only one baretest reports)
- unit:        `different keys written in parallel all write to DB` — rateLimiting.test.ts:123 — `5 !== 4` (expected all keys written to DB incl. `__db_lastAccess__`)
- integration: `create_new_workbook creates workbook and sets as current` — workbook-flow.test.ts:55 — `null` !== `'test-workbook.xlsx'` (create_new_workbook did not set current file)
- e2e:         `full lifecycle: create → write data → list → export → close` — workbook-lifecycle.test.ts:70 — `0 !== 1`
- property:    `write then read string round-trips` — cell-properties.test.ts:79 — fast-check property failed (counterexample inputs such as `"!"`, `"#"`, `"*"`, `"\""`)

## Notes
- All four suites were invoked from the project root via their npm scripts (`npm test`,
  `npm run test:integration`, `npm run test:e2e`, `npm run test:property`); each delegates to `tsx`.
  The runners use `baretest`, which does NOT print a pass/fail summary and exits 0 even when a test
  fails (property suite is the exception — it exits 1 because fast-check's `.assert()` throws).
- No compile errors and no missing-dependency / environment errors prevented any suite from running.
  Every suite loaded its test modules, started executing tests, and produced real assertion output.
- Integration suite prints recurring `"User is undefined"` lines during execution. This is an
  auth-context warning emitted by the server under test, NOT a hard failure — tests still ran and the
  first real assertion failure (`create_new_workbook ...`) is the reported blocker.
- The unit suite's first failure is timing/order-sensitive: an earlier run instead failed
  `same key written multiple times within 1 second writes latest value after wait` (rateLimiting.test.ts:71,
  `0 !== 2`), and a separate run failed `lock regression: 1s write throttle ...` with
  "The database connection is not open" (better-sqlite3). These rate-limit / DB-connection tests appear
  flaky and may surface different first failures across runs. They are NOT src compile errors.
- No `src/` files were created, modified, or deleted. Per-suite raw output captured to
  `test/findings/_unit.log`, `_integration.log`, `_e2e.log`, `_property.log` for reference.
