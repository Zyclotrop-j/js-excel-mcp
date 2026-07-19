# Architecture Decision — Elicitation SDK blocker (per-request legacy serving)

**Decision ID:** arch-decision-elicitation-blocker
**Author:** Lead Architect
**Date:** 2026-07-20
**Status:** Final — binding on all downstream tickets
**Resolves:** T-41 implementer's 🔴 critical blocker; affects T-41, T-42, T-43, T-51

---

## 0. Trigger

T-41's implementer surfaced a 🔴 critical blocker: `inputRequired.elicit()`
does not work in the current SDK's per-request legacy serving mode. T-41,
T-42, T-43 all use `inputRequired.elicit()` for their signup/signin/recover
flows; T-51 uses it for passkey registration. If elicitation doesn't work,
these tools can't function.

The Project Lead (PL) analysed the failure and recommended **Option 2 —
no-elicitation fallback (tool arguments)**. This document records my
verification of the PL's analysis and the binding decision.

---

## 1. Investigation (what I verified, not speculated)

### 1.1 Protocol version is legacy

`node_modules/@modelcontextprotocol/server/dist/mcp-VMtm_ePi.cjs:780`:

```js
const LATEST_PROTOCOL_VERSION = "2025-11-25";
```

The modern era is `2026-07-28`. We are firmly in the legacy era.

### 1.2 There is no legacy-era elicitation callback

`grep -r "requestElicit|requestElicitation"` across
`node_modules/@modelcontextprotocol/server/dist/` → **zero results**.

The existing sampling code in `src/tools/handleCells/discovery.ts:385-392`
uses a **direct callback** (`ctx.requestSampling`) that the transport layer
injects onto `mcpReq` for the 2025 era — this is the legacy bypass that
makes sampling work. Elicitation has **no equivalent** `mcpReq.requestElicit`
injection point. The SDK simply has no legacy-era elicitation callback the
way it has a legacy-era sampling callback.

### 1.3 The capability gate fails on per-request McpServer instances

The SDK's `LegacyInputRequiredShim.fulfill()` (line 9239) calls
`this._host.resolvedClientCapabilities(ctx)`, which delegates to
`McpServer._inputRequestCapabilityView(ctx)` (line 9606-9607):

```js
_inputRequestCapabilityView(ctx) {
    return this._servedModernEra()
        ? ctx.mcpReq.envelope?.[CLIENT_CAPABILITIES_META_KEY]
        : this._clientCapabilities;
}
```

In the 2025 era, the view is `this._clientCapabilities` — the capabilities
declared by the client during the `initialize` handshake.

**The problem:** both `/mcp` and `/mcp/bootstrap` in `src/server.ts` use
`createMcpHandler(async (context) => { const server = new McpServer(...);
return server; })` — a **per-request McpServer factory**. A fresh `McpServer`
instance is constructed for every request. That fresh instance **never sees
the `initialize` handshake** (which happens once at session establishment
on the transport layer, not per request). Therefore `this._clientCapabilities`
is **never populated** on either endpoint's per-request server.

When the legacy shim runs the capability check (line 9244):

```js
if (missingClientCapabilities(required, declared) !== void 0)
    return legacyShimFailure(method, `Cannot request input '${key}' (${embedded.method}): the client on this 2025-era connection did not declare the required capability (no client capabilities are available on this connection — per-request legacy serving cannot receive server-to-client requests)`);
```

`declared` is `undefined` (no `_clientCapabilities`), so
`missingClientCapabilities({ elicitation: { form: {} } }, undefined)`
returns non-undefined → `legacyShimFailure` → the tool call returns an
`isError: true` text result with that message. Elicitation **never fires**.

### 1.4 Why sampling works but elicitation doesn't

`discovery.ts` doesn't go through the SDK's `createMessage()` capability
gate in the legacy era — it reads `ctx.mcpReq.requestSampling` (a direct
callback the transport injects) and calls it directly (line 385-389).
That callback bypass exists because the transport layer wires it for
backwards compatibility with 2025-era clients. Elicitation is a
**2026-era addition** with no backwards-compatible callback hook — the
only path is the `inputRequired`/`LegacyInputRequiredShim` route, which
gates on `_clientCapabilities`.

### 1.5 Both endpoints are affected

- `/mcp/bootstrap` (T-41, T-42, T-43): per-request factory at
  `src/server.ts:160-176`. Confirmed affected.
- `/mcp` (T-50, T-51, T-52): per-request factory at
  `src/server.ts:108-144`. **Also affected.** T-51 (passkey registration)
  uses elicitation per `[C-AT]` and would hit the same gate.

T-50 (signout) and T-52 (rotate_apikey) use plain `CallToolResult` — no
elicitation, not affected.

---

## 2. Options considered

### Option 1 — Dual-era pattern for elicitation
**NOT VIABLE.** There is no `requestElicitation` callback on `mcpReq` in
the legacy era (verified: zero grep hits). The SDK has no legacy bypass
for elicitation the way it does for sampling. Rejected.

### Option 2 — No-elicitation fallback (tool arguments)  ✅ CHOSEN
Take all inputs (`name`, `email`, `password`, `credentialType`, etc.) as
**tool arguments** directly in the tool's `inputSchema`. The LLM collects
them from its conversation with the user, then calls the tool with all
args in one shot. No elicitation round-trip, no capability check, works in
both eras.

**UX trade-off:** the LLM gathers info in conversation, then calls
`auth_signup({ name, email, password, credentialType })` in one call. This
is functionally equivalent to elicitation — the LLM is driving the flow
anyway, and the LLM (not the client) is the one that would have surfaced
the elicitation form to the user in most MCP client implementations. The
tool's `description` tells the LLM what to collect.

**Why this is the most surgical option:**
- No SDK upgrade → zero risk to `createMcpHandler` / `McpServer` /
  `requireBearerAuth` APIs → zero risk to the demo invariant (§8.1).
- No new npm deps.
- The `inputSchema` for the auth tools is **already** the zod schema that
  was previously passed to `inputRequired.elicit({ requestedSchema })` —
  the schema shape doesn't change, only the plumbing does.
- The `chain_operations` rejection of `InputRequiredResult`
  (`handleChain.ts:120-127`) no longer applies to these tools (they no
  longer return `InputRequiredResult`). The tools still shouldn't be
  chained (auth side-effects), but the rejection is now by convention in
  the tool `description`, not by the SDK type.

### Option 3 — SDK upgrade to 2026-07-28 era
**REJECTED.** Upgrading `@modelcontextprotocol/server` to a version that
supports the 2026-07-28 protocol era risks breaking changes to
`createMcpHandler` / `McpServer` / `requireBearerAuth`, which are
load-bearing for the demo invariant (§8.1) and every Excel tool. Heavy
and risky for a UX nicety. The 2.0.0-beta.3 pin is shared across
`@modelcontextprotocol/server`, `@modelcontextprotocol/express`, and
`@modelcontextprotocol/sdk` — a coordinated bump is a multi-package
upgrade with broad blast radius. Defer to a dedicated upgrade ticket
outside the real-auth initiative if/when the SDK stabilises the 2026 era.

---

## 3. Decision: Option 2 — tool arguments, no elicitation

All auth tools that previously used `inputRequired.elicit()` MUST instead
take their inputs as `inputSchema` tool arguments. The LLM collects the
values from its conversation with the user and passes them in a single
`tools/call`. The tool validates via zod (the same schema, now in
`inputSchema` instead of `requestedSchema`), then proceeds directly to
the server-side better-auth call — no retry round, no `acceptedContent`,
no `inputResponse`.

### Affected tickets and refactor scope

| Ticket | Tool | Surface | Elicitation use | Refactor |
|---|---|---|---|---|
| T-41 | `auth_signup` | `/mcp/bootstrap` | signup form (name/email/credentialType/password) | Remove `inputRequired`/`acceptedContent`/`inputResponse` round-trip. `arg` (validated by `inputSchema: signupSchema`) IS the `SignupInput`. |
| T-42 | `auth_signin` | `/mcp/bootstrap` | signin form (identifier/password or magic-link) | Same pattern — `inputSchema` args, no elicit. |
| T-43 | `auth_recover` | `/mcp/bootstrap` | recover form (identifier/backupCode) | Same pattern. |
| T-51 | `auth_add_passkey` | `/mcp` | passkey registration (attestation response) | Two-call flow: call 1 → `generatePasskeyRegistrationOptions` → return challenge; call 2 → `verifyPasskeyRegistration` with `attestationResponse` arg. OR single-call if the client returns the attestation in one shot. T-51's implementer decides the cleanest split — the elicitation round-trip was the two-round mechanism; without it, either two tool calls or a single call with the attestation pre-collected by the LLM works. |
| T-50 | `auth_signout` | `/mcp` | none (plain `CallToolResult`) | **No refactor.** Not affected. |
| T-52 | `auth_rotate_apikey` | `/mcp` | none (plain `CallToolResult`) | **No refactor.** Not affected. |

### T-41 specific refactor instructions

The implementer's current `src/tools/auth/signup.ts` (373 LOC) is written
around the elicitation round-trip. The refactor is **mechanical and
localised**:

1. **Keep** the `signupSchema` (lines 98-105) — it moves from
   `requestedSchema` to `inputSchema` (it's already passed as
   `inputSchema: signupSchema` on line 189, so the schema plumbing is
   already correct).
2. **Delete** the elicitation round-trip in `handleSignup` (lines 215-240):
   the `acceptedContent(inputResponses, KEY, signupSchema)` check, the
   `inputRequired({ inputRequests: { [KEY]: inputRequired.elicit({...}) } })`
   return, and the `inputResponse(inputResponses, KEY)` decline/cancel
   detection. None of this fires.
3. **Replace** the `_arg: unknown` + `inputResponses` signature of
   `handleSignup` with `arg: SignupInput` — `arg` IS the validated input
   (zod validation happens before the callback per the SDK). Rename
   `existing` → `input` (or just use `arg` directly).
4. **Delete** the `PerRequestCtx` type and `getInputResponses` helper
   (lines 118-126) — no longer needed.
5. **Delete** the `import { acceptedContent, inputRequired, inputResponse }`
   (keep `CallToolResult`, `InputRequiredResult` only if still referenced;
   `InputRequiredResult` is no longer returned so drop it too).
6. **Update** the tool `description` (lines 176-188): remove "Uses
   elicitation to collect signup details" and "**Not chainable:** this
   tool uses elicitation…" — replace with guidance that the LLM should
   collect `name`, `email` (for password/magiclink), `credentialType`,
   and `password` (for password) from the user before calling. Keep the
   backup-code handling instructions. The "not chainable" guidance stays
   (auth side-effects) but the reason changes from "elicitation" to
   "auth side-effects / session establishment".
7. **Update** the file header docblock (lines 1-70): remove the
   "Elicitation flow" section; replace with a "Tool arguments" section
   describing the single-call flow.
8. The `__test__signupSchema` export (line 403) stays — the schema is
   unchanged and still useful for tests.

The non-elicitation parts (signUpEmail / signInEmail / enableTwoFactor /
cookieHeaders handoff / backup codes / passkey throwaway-password
bootstrap / `authSurface = 'bootstrap'` / `authConfig` plumbing) are
**correct and stay as-is** — see the TASK B review in the dispatch message.

---

## 4. Contract amendments applied

### 4.1 `[C-PA]` — remove elicitation mandate
The bullet "Use `inputRequired.elicit(...)` to gather user input." is
replaced with the tool-arguments approach. The "Are not included in
`chain_operations`" bullet is kept but re-reasoned (auth side-effects,
not `InputRequiredResult` rejection).

### 4.2 `[C-AT]` — remove elicitation mandate
"They use elicitation where they need user input (passkey registration)
and a plain `CallToolResult` otherwise (signout)." → tool-arguments for
passkey registration; plain `CallToolResult` for signout/rotate-apikey.

### 4.3 `[C-ELICIT]` — repurpose to `[C-INPUT]` (tool-arguments pattern)
The contract is renamed (ID kept as `[C-ELICIT]` for traceability, with a
note) and its body now describes the tool-arguments pattern instead of the
elicitation round-trip. The zod schema shape is preserved — only the
plumbing (`inputSchema` vs `requestedSchema`) changes.

### 4.4 §4 banner
A note is added at the top of §4 ("Elicitation — what the SDK actually
gives us") stating that elicitation is **not used** due to this decision,
and pointing implementers here. §4's reference content is preserved (it's
still accurate documentation of the SDK surface) but is no longer
load-bearing for any ticket.

### 4.5 No other contracts amended
`[C-ENV]`, `[C-MODE]`, `[C-MAILER]`, `[C-DB]`, `[C-EP]`, `[C-PL]`,
`[C-SI]`, `[C-VF]`, `[C-REG]`, `[C-RECOVER]`, `[C-APIKEY]` — unchanged.
`[C-RECOVER]`'s reference to "collects `{ identifier, backupCode }` via
elicitation" is corrected in the ticket scope note (T-43), not the
contract body (the contract says "via elicitation" — amended to "via tool
arguments" in the surgical edit).

---

## 5. Downstream unblocks (signal to PL)

- **T-41** — implementer MUST refactor per §3 instructions. After refactor,
  re-run `npm test` (121 must still pass) and `npx tsc --noEmit`. Then the
  non-elicitation review (TASK B) applies.
- **T-42, T-43** — not yet started. Implementers read this note + the
  amended `[C-PA]`/`[C-ELICIT]` and follow the tool-arguments pattern from
  the start. No elicitation code to write.
- **T-51** — not yet started. Implementer uses a two-call flow
  (generate-options → verify-attestation) or single-call with pre-collected
  attestation, per §3. Read this note before coding.
- **T-50, T-52** — unaffected. T-50 review (TASK C) proceeds as-is.

---

## 6. Minor: `handleChain.ts:122` error message

The implementer flagged that `handleChain.ts:122` says "requires client
input (sampling)" for any `InputRequiredResult`. With elicitation removed,
`sampling` is now the only remaining `InputRequiredResult` producer
(`discovery.ts`), so the message is **correct as-is**. No change needed.
(If a future tool re-introduces elicitation after an SDK upgrade, revisit
this message — but that's out of scope today.)

---

## 7. Standing rules honored

- **No production code written** by the Lead Architect. This file is a
  decision document; the PL and ICs implement the refactor.
- **No `npm test` or PM2 restart** by the Lead Architect.
- **Demo invariant (§8.1)** preserved — demo mode never touches the auth
  tools or elicitation; this decision only changes real-mode auth-tool
  plumbing.
- **No `process.env` reads** introduced.
- **No new npm deps** — Option 2 needs none.
- **Surgical contract edits only** — `[C-PA]`, `[C-AT]`, `[C-ELICIT]`
  amended; §4 banner added; all other contracts preserved.
- **Installed SDK is the source of truth** — every claim in §1 was
  verified against `node_modules/@modelcontextprotocol/server/dist/`
  source, not the docs site.
