# T-11 — In-process pending-login nonce store

- **Difficulty:** 🟢 easy
- **Type:** Foundation
- **Dependencies:** none
- **Output:** `src/shared/pendingLogin.ts`
- **Blocks:** T-22, T-41, T-42, T-43

## Goal

A tiny, dependency-free in-process store that lets the auth tools
(signup / signin / recover) hand a freshly-created better-auth
session to the auth server's `/sign-in` route, so the OAuth
authorization-code flow can complete without the LLM having to
manually thread credentials through query params.

## Context (read before starting)

- `[C-PL]` in `STUDY_FIRST.md` — the contract for this store.
- `STUDY_FIRST.md` §5 "The two-process-same-process trick" — why a
  module-level `Map` works across the two Express apps.
- T-01's notes — confirm the in-process Map visibility spike was
  done. (If T-01 hasn't landed yet, run the spike yourself: a 20-line
  throwaway script in the temp dir is enough.)

## Scope

### New file `src/shared/pendingLogin.ts`

Implements `[C-PL]` exactly:

```ts
export interface PendingLogin {
  nonce: string;          // opaque, uuid v4 (use `crypto.randomUUID()`)
  userId: string;         // better-auth user id
  expiresAt: number;      // epoch ms, NOW + 5 min
  sessionId?: string;     // set by the auth tool after signInEmail succeeds
  cookieHeaders?: string[]; // Set-Cookie headers from the signInEmail response (if captured)
}

export function createPendingLogin(userId: string): PendingLogin;
export function consumePendingLogin(nonce: string): PendingLogin | null;
export function peekPendingLogin(nonce: string): PendingLogin | null;
export function peekMostRecentPendingLogin(): PendingLogin | null; // for /sign-in polling fallback
export function sweep(): number; // removes expired entries; returns count removed
```

### Implementation rules

- Storage: `const store = new Map<string, PendingLogin>()` at
  module scope. **No persistence.** A process restart drops all
  pending logins; the LLM just retries the auth tool.
- TTL: 5 minutes from creation. After `expiresAt`, `peek` and
  `consume` return `null`.
- `createPendingLogin` runs `sweep()` first (cheap) so the Map
  doesn't grow unboundedly.
- `consumePendingLogin` is **one-shot**: it removes the entry and
  returns it, or returns `null` if not found / expired. Used by
  `/sign-in` (T-22) when the nonce is supplied via query param.
- `peekPendingLogin` is non-destructive. Used by `/sign-in` (T-22)
  when polling for the most recent pending session.
- `peekMostRecentPendingLogin` returns the most recent unexpired
  entry whose `sessionId` is set (i.e. the signup tool has finished
  calling `signInEmail`). This is the **fallback** mechanism when
  the nonce can't be threaded via query string (see T-01's notes
  on `/sign-in` ↔ nonce handoff).
- `cookieHeaders` is optional. The signup tool can capture the
  `Set-Cookie` headers from the `signInEmail` `asResponse: true`
  call and stash them here, so `/sign-in` can re-emit them without
  re-issuing a session. If `cookieHeaders` is undefined, `/sign-in`
  calls `signInEmail` again. (T-22 decides which path.)
- Use Node's built-in `crypto.randomUUID()` — no `uuid` package
  dep.

### Tests

Add a unit test under `test/unit/pendingLogin.test.ts` (the project
uses `baretest` — see `test/run.ts`):

- `createPendingLogin` returns a `PendingLogin` with a uuid `nonce`,
  `expiresAt` ≈ now+5min, `sessionId` undefined.
- `peekPendingLogin(nonce)` returns the entry; second call still
  returns it (non-destructive).
- `consumePendingLogin(nonce)` returns the entry and removes it;
  a second `consume` returns `null`.
- After `expiresAt` (use a fake clock or monkey-patch `Date.now`
  for the test), `peek` and `consume` return `null`.
- `peekMostRecentPendingLogin` returns the entry with the largest
  `expiresAt` (most recent) among those with `sessionId` set;
  returns `null` if none qualify.
- `sweep()` removes expired entries and returns the count.

## Contract this ticket honors / establishes

- Establishes `[C-PL]`.

## Do not do

- Do not write any auth tool or any `/sign-in` route. This ticket
  is the store only.
- Do not import better-auth. The store is auth-framework-agnostic.
- Do not persist to disk. Ever.
- Do not add `uuid` or any new dep — `crypto.randomUUID()` is
  built in (Node ≥ 14.17, the project's Node is far newer).

## Verify

- `npm run build` passes.
- `npm test -- --grep pendingLogin` (or equivalent) passes.
- A 30-line spike script in
  `C:\Users\Janne\AppData\Local\Temp\opencode\t-11-spike.mjs`
  that imports the store and round-trips a nonce works. (Don't
  commit the spike.)
