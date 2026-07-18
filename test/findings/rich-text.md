# Findings: rich-text.test.ts

**Result: FAIL**

## Summary

Ran `test/integration/rich-text.test.ts` in isolation via `test/integration/rich-text.run.ts`
(`npx tsx test/integration/rich-text.run.ts`). baretest aborts on the first failing
test.

## First failing test

```
! set_rich_text errors when no workbook is open
```

### Error

```
AssertionError [ERR_ASSERTION]: expected 'no workbook is currently open' error, got:
[{"type":"text","text":"context:\n  file: rich-text-test.xlsx\n  sheet: Sheet1\n  cell: A1\n  asOf: ..."},
 {"type":"text","text":"rich text with 1 runs set on cell A1"}]
    at test/integration/rich-text.test.ts:110:16
```

The test passed the request under a separate userId (`rich-text-other-user`) and
expected the call to fail with the "no workbook is currently open" error. Instead the
call succeeded and wrote to `rich-text-test.xlsx` belonging to a *different* user.

The three prior tests (`setup`, `set_rich_text sets multiple runs with mixed
formatting`, `set_rich_text accepts row/col instead of ref`, `set_rich_text with a
single plain run`) passed. Baretest aborts at this point, so later tests
(`teardown`) were not executed.

## Suspected src cause

`src/tools/handleRichText.ts` resolves its `Context` **once at `register()` time**
(line 13):

```js
const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');
```

- The handler binds to a single `context` captured when `register([])` is called
  (during the `setup` test, against the `rich-text-test` user's context).
- The per-request `ctx` argument passed to the tool callback
  (`createMockRequestContext('rich-text-other-user')`) is **never consulted** to
  re-derive the context.
- As a result, the "no workbook is currently open" guard at line 40–41
  (`arg.workbook ?? await context.getCurrentFile()`) is evaluated against the
  registration-time context — which has `rich-text-test.xlsx` open — rather than the
  requesting user's (empty) context.

This means per-request / per-user workbook isolation is not honored by
`set_rich_text`. The test's assumption (a separate request userId maps to an isolated
"no workbook open" state) is violated by this src behavior.

**NOTE:** Per the hard constraints, `src/` was NOT modified. The failure is logged as
a suspected src-side issue (context resolved at registration rather than per request).

## Notes

- Per-user isolation in the test harness relies on a per-user temp SQLite DB
  (`data/${userId}.db` via `createTestContext`) and the request `authInfo.extra.userId`.
  The rich-text handler does not thread the request userId through to `Context.getContext`
  at call time, so isolation does not take effect for this tool.
- The runner file `test/integration/rich-text.run.ts` was created and then deleted per
  instructions; it is no longer present.
- `WARNING: User is undefined` printed at startup comes from the `set-context`/`run`
  wrapper logging; unrelated to the failure.
