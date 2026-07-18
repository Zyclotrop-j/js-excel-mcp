# Findings: comment.test.ts

**Date:** 2026-07-18
**Runner:** `npx tsx test/integration/comment.run.ts` (isolated)
**Result:** FAIL

## Failure

baretest aborts on FIRST failing test. The first failing test is:

**`! delete_comment reports no comment when cell has none`** (the 4th test in the suite)

**Error:**
```
AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

  assert.ok(result.content.some((c: any) => c.text && c.text.includes('no comment found on cell B1')))

    at comment.test.ts:98:16
```

The `delete_comment` call on `B1` returned content that did NOT contain the expected string `no comment found on cell B1`. Instead, because B1 actually carried a comment, the handler returned `comment removed from cell B1` (the `removed` branch), so the assertion failed.

## Suspected src cause

None / test-side state leakage — not a src bug.

- In `src/tools/handleComment.ts` (lines 102–112), `delete_comment` correctly computes `removed = ws.legacyComments.length < before` and emits `no comment found on cell ${ref}` only when nothing was filtered out. The src behaves correctly given the comment state on B1.
- The test suite shares a single workbook (`comment-test.xlsx`) across tests. The 2nd test, `add_comment uses default author when not provided` (line 61–72), writes a comment onto **B1**. The 4th test then assumes B1 has *no* comment and asserts the `no comment found` message — but B1 already has a comment from the earlier test. This is cross-test state leakage (the suite does not clear/reset comment state between tests), so the assertion's precondition is violated.

Per task constraints, src was NOT modified.

## Notes

- The run printed `User is undefined` at the top — `CommentHandler`/`WorkbookTools` `register()` logs `User is ${this.context.authInfo?.extra?.userId}`, and the test context's `authInfo?.extra?.userId` is undefined. This is a separate non-fatal log, not the cause of the abort.
- Tests that ran before the failure (`setup`, `add_comment adds a comment to a cell`, `add_comment uses default author when not provided`, `delete_comment removes an existing comment`) passed. The abort happened at the 4th test, so `delete_comment reports no comment when cell has none` (4th) and all later tests (`delete_comment errors with no open workbook`, `teardown`) did not complete.
- baretest returned no `✓ N` — the suite did not complete; it aborted at the first failure.
