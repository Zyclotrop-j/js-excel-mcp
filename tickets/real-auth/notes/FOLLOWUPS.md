# Follow-ups — Real-Auth Initiative

Gaps discovered during the run and planned future work, with recommended priority.

---

## P1 — T-80: Mailer pluggability (SendGrid/Postmark)

**Ticket:** `T-80-mailer-pluggability.md`
**Rationale:** Real mode's default `consoleMailer` logs OTP/magic-links to stdout. Production needs a real email delivery service. The `OtpMailer` interface and `webhookMailer` are already wired; T-80 adds SendGrid/Postmark behind the same slot.
**Recommended priority:** First follow-up after closeout. Blocks production deployment.

---

## P2 — T-81: DB pluggability (D1/Turso/Postgres)

**Ticket:** `T-81-db-pluggability.md`
**Rationale:** Real mode uses file-backed SQLite (`data/_auth_real.db`). Cloud-native deployments need D1 (Cloudflare Workers) or Turso/Postgres. The `AuthDatabase` interface is already wired; T-81 adds Kysely-backed implementations.
**Recommended priority:** Second follow-up. Needed for managed hosting.

---

## P3 — MCP SDK upgrade (elicitation support)

**Rationale:** The installed `@modelcontextprotocol/server@2.0.0-beta.3` uses the 2025-11-25 protocol (legacy era). Elicitation (`inputRequired.elicit()`) doesn't work in per-request serving mode — all auth tools use tool arguments instead. Upgrading to the 2026-07-28 era SDK would enable proper multi-round elicitation flows (better UX for passkey registration, 2FA challenges, etc.).
**Recommended priority:** After SDK stabilizes the 2026 era. Coordinated bump of `@modelcontextprotocol/server`, `@modelcontextprotocol/express`, and `@modelcontextprotocol/sdk` — broad blast radius.

---

## P4 — better-auth upgrade (passkey session bootstrap)

**Rationale:** `verifyPasskeyRegistration` returns the `Passkey` row but no session. `auth.api.createSession(...)` doesn't exist in better-auth v1.6.23. T-41 works around this with a throwaway-password bootstrap (synthetic email + throwaway password → `signInEmail` → session). A future better-auth version may add `createSession`, eliminating the throwaway.
**Recommended priority:** When better-auth adds the API. Low urgency — the throwaway works.

---

## P5 — Passkey-only backup-code recovery

**Rationale:** `verifyBackupCode` requires a `two_factor` cookie from `signInEmail` (which needs a password). Passkey-only accounts can't recover via backup codes. T-43 returns an error directing the user to contact the operator.
**Recommended priority:** When better-auth supports passwordless backup-code verification. Low urgency — the limitation is documented and the error is actionable.

---

## P6 — Alternative architecture: single-endpoint dynamic tool discovery

**Rationale:** A brainstorm session proposed an alternative to the two-endpoint split (`/mcp/bootstrap` + `/mcp`): a single `/mcp` endpoint with dynamic tool discovery based on the `Authorization` header. Unauthenticated requests see only auth tools; authenticated requests see all tools. Uses `notifications/list_changed` to trigger live tool refresh after OAuth. This avoids the LLM needing to know about `/mcp/bootstrap` — the 401 is never surfaced as a connection-level block.
**Recommended priority:** Future architecture iteration after the SDK upgrade (P3). The current two-endpoint approach works and is tested; the single-endpoint approach would simplify the LLM's discovery story but requires SDK support for dynamic tool lists.

---

## P7 — `handleChain.ts` error message update

**Rationale:** `handleChain.ts:122` says "requires client input (sampling)" for any `InputRequiredResult`. After the elicitation decision (Option 2), auth tools no longer return `InputRequiredResult`, so the message is now accurate (only sampling tools produce it). No action needed unless the SDK is upgraded and elicitation returns.
**Recommended priority:** None (self-resolved by the elicitation decision).

---

## P8 — `AGENTS.md` stale Auth section

**Rationale:** The existing `### Auth` subsection under "Key Conventions" still says "Demo-only — hardcoded credentials." The new "Auth modes" section (T-71) documents the full picture, but the old subsection wasn't updated to cross-reference it. Minor docs hygiene.
**Recommended priority:** Quick fix in any future docs pass.
