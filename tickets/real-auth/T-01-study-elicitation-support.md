# T-01 — Confirm MCP client elicitation support + `acceptedContent` semantics

- **Difficulty:** 🟡 medium
- **Type:** Study (no production code)
- **Dependencies:** none
- **Output:** `tickets/real-auth/notes/T-01-notes.md`
- **Blocks:** T-40, T-41, T-42, T-43, T-51

## Goal

Confirm that:

1. The MCP **client** the project tests with actually sends an
   `elicitation/createRequest` capability and fills in
   `inputResponses` on retry — i.e. that elicitation is a real
   round-trip, not server-only.
2. The retry/re-issue mechanics work the way the SDK's `.d.ts`
   promises, specifically that the same tool name + the same
   `McpRequestContext` carries `inputResponses` on the second
   invocation.
3. The handoff between the auth server's `/sign-in` route and the
   pending-login store (see `[C-PL]`) is feasible — i.e. both apps
   can read/write the same module-level `Map`.

## Why this first

The entire signup-via-MCP design hinges on elicitation actually
working end-to-end. The server side already uses it in
`src/tools/handleCells/discovery.ts:372-393`, so server-side support
is confirmed. The client side is the open question. If the test
client doesn't support elicitation, the auth tools must fall back
to a structured prompt in the tool's `description` and free-text
input — much less ergonomic.

## Scope

1. **Identify the test client(s).** Read:
   - `examples/oauth/client.ts` (referenced in `authServer.ts:48-49`)
   - any other files under `examples/` and `test/` that drive the MCP
     server with `@modelcontextprotocol/...` client SDK.
2. **Check client SDK version.** The client may come from
   `@modelcontextprotocol/client` (not a current dependency — it
   may be a `devDependency` or used only by the test harness). Read
   `package.json` and any lockfile entries to find the version.
3. **Check the client's capability advertisement.** Does it send
   `elicitation` in its `initialize` request's `capabilities`?
   Grep the client SDK's `.d.ts` for `elicitation`, `ElicitRequest`,
   `createRequest`, and `InputResponse`.
4. **Check `inputResponses` plumbing on the server side.** Re-read
   `src/tools/handleCells/discovery.ts` lines 365-395 and confirm
   the round-trip:
   - First call: tool returns `InputRequiredResult`.
   - Client re-issues `tools/call` with `inputResponses` set on the
     request.
   - Second call: `ctx.inputResponses[KEY]` is populated; the tool
     proceeds.
   Note exactly where `inputResponses` is read in the existing code
   so the auth tools can mirror the pattern.
5. **Spike the in-process pending-login handoff.** Write a tiny throwaway
   script (do **not** commit it; put it in
   `C:\Users\Janne\AppData\Local\Temp\opencode\t-01-spike.mjs`) that:
   - imports nothing from the project,
   - declares `const map = new Map()` in one module,
   - imports it from a second module and writes, then from a third
     and reads,
   - confirms the value is visible across "apps" (this is just
     confirming Node's module singleton behavior — it should be
     trivially true, but document it so T-22 doesn't have to
     re-verify).
6. **Check the `/sign-in` ↔ OAuth flow race condition.** The client
   SDK starts the OAuth flow when it sees a 401. It will hit
   `/sign-in` once. The signup tool has just stored the nonce. Does
   the `/sign-in` route see the nonce? The spike in step 5 covers the
   "same process, same Map" part; this step is about whether the
   `login_nonce` query param needs to be threaded from the tool
   result → LLM → client SDK's authorize URL. Confirm whether the
   SDK lets the LLM supply extra params to the authorize URL, or
   whether `/sign-in` must *poll* the pending-login store for the
   most recent entry. Record both options — T-22 picks one.

## Deliverable

`tickets/real-auth/notes/T-01-notes.md` with:

- **Section: Client SDK version & elicitation support** — the
  client package name, version, and whether it advertises the
  `elicitation` capability. If it doesn't, note the fallback
  (structured prompt + free-text args).
- **Section: Round-trip mechanics** — copy the relevant
  `discovery.ts` lines and annotate them with what the auth tools
  must do.
- **Section: In-process Map visibility** — one-sentence
  confirmation that a module-level `Map` is visible across both
  Express apps.
- **Section: `/sign-in` ↔ nonce handoff options** — list the two
  candidate mechanisms (query param vs. polling) with pros/cons
  and a recommendation. T-22 will implement the recommended one.

## Do not do

- Do not modify any project source.
- Do not commit the throwaway spike script (it lives in the temp
  dir).
- Do not implement the auth tools here. This is investigation only.

## Verify

The notes file exists and answers all six scope points. The
recommendation for the `/sign-in` handoff is explicit and actionable.
