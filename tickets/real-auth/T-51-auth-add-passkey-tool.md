# T-51 — `auth_add_passkey` tool (elicitation → passkey register)

- **Difficulty:** 🟡 medium
- **Type:** Authenticated tool
- **Dependencies:** T-50 (Express headers in `requestContext`), T-00
  (passkey plugin API), T-40 (AuthToolHandler base)
- **Output:** `src/tools/auth/addPasskey.ts`, re-exported from
  `src/tools/auth/index.ts`

## Goal

A tool the LLM calls from the authenticated `/mcp` endpoint to
attach a new passkey to the current user's account. Used after
`auth_signup` with `credentialType=passkey` (where the account was
bootstrapped with a throwaway password) or after `auth_recover` (to
replace a lost credential).

The tool uses elicitation to drive the WebAuthn registration
ceremony: it asks the client for the authenticator's response to a
server-issued challenge.

## Context (read before starting)

- `[C-AT]`, `[C-ELICIT]` in `STUDY_FIRST.md`.
- T-00's notes — exact `passkey.register` / `passkey.verify` /
  `passkey.listUserPasskeys` API shapes; whether the SDK's passkey
  register is a two-step (server issues challenge → client
  authenticator responds → server verifies) or one-step.
- T-50's `requestContext.ts` extension (the tool needs the current
  session cookie to identify the user).
- WebAuthn fundamentals — the client (LLM host or browser) must
  have an authenticator. The MCP client SDK may or may not support
  WebAuthn directly; T-01's notes flag this. If it doesn't, this
  tool falls back to issuing a challenge and asking the user to
  complete it in a browser (the tool's `description` explains).

## Scope

### 1. `src/tools/auth/addPasskey.ts`

```ts
import z from 'zod';
import { inputRequired, acceptedContent, inputResponse, type InputRequiredResult, type CallToolResult } from '@modelcontextprotocol/server';
import { AuthToolHandler } from './baseAuthTool.js';
import { getAuth } from '../../shared/authServer.js';
import { getExpressRequestHeaders } from '../../util/requestContext.js';

const KEY = 'addPasskey';

const challengeResponseSchema = z.object({
  // The exact shape depends on better-auth's passkey plugin — T-00
  // confirms. Roughly the WebAuthn `AttestationCredentialJSON`:
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
    // ...other WebAuthn fields per the plugin's expectation
  }),
}).describe('The WebAuthn attestation response from the client authenticator. Generate this by calling navigator.credentials.create({ publicKey: <challenge> }) in a browser, or using your client SDK\'s passkey support.');

const requestSchema = z.object({
  authenticatorLabel: z.string().optional().describe('Optional friendly name for the passkey (e.g. "iPhone Face ID").'),
}).describe('Attach a new passkey to your account. The tool first returns a WebAuthn challenge; complete it with your authenticator and call this tool again with the attestation response.');

export class AuthAddPasskeyHandler extends AuthToolHandler {
  static readonly authSurface = 'authenticated' as const;

  async register(): Promise<void> {
    this.registerTool('auth_add_passkey', {
      title: 'Add passkey',
      description: 'Attach a new passkey to the current account. Two-step: first call returns a WebAuthn challenge; complete the challenge with your authenticator (browser navigator.credentials.create or client SDK passkey support) and call again with the attestation response.',
      inputSchema: requestSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true, readOnlyHint: false }
    }, async () => this.handle());
  }

  private async handle(): Promise<CallToolResult | InputRequiredResult> {
    const auth = getAuth();
    const headers = getExpressRequestHeaders() ?? new Headers();

    // First round: ask for the attestation response.
    const existing = acceptedContent(this.context.inputResponses, KEY, challengeResponseSchema);
    if (!existing) {
      // Issue a WebAuthn challenge via better-auth's passkey plugin.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const challenge = await (auth.api as any).passkey.register({ headers });
      return inputRequired({
        inputRequests: { [KEY]: inputRequired.elicit({
          message: 'Complete the WebAuthn registration ceremony with this challenge and return the attestation response.',
          requestedSchema: challengeResponseSchema,
          // Embed the challenge in the message or in a custom field the
          // client can read. Better-auth's challenge shape per T-00.
        }) }
      });
    }

    const view = inputResponse(this.context.inputResponses, KEY);
    if (view.kind === 'elicit' && view.action !== 'accept') {
      return this.text('Passkey registration declined.', false);
    }

    // Second round: verify the attestation response.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verifyResult = await (auth.api as any).passkey.verify({
      headers,
      body: { attestationResponse: existing /* shape per T-00 */ }
    });

    if (verifyResult?.status === 'error' || !verifyResult?.ok) {
      return this.text(`Passkey verification failed: ${verifyResult?.message ?? 'unknown error'}`, true);
    }

    return this.text('Passkey added. You can now use this passkey to sign in via the standard OAuth /sign-in page.');
  }

  private text(t: string, isError = false): CallToolResult {
    return { content: [{ type: 'text', text: t }], isError };
  }
}
```

### 2. Two-round-trip elicitation

The first round elicits the attestation response *after* issuing
the challenge. The challenge is embedded in the `message` or in a
custom field on the elicit request (the SDK's `requestedSchema`
covers the *response* shape; the *input* — the challenge — has to
be communicated via the `message` string or a sibling field).
Confirm with T-01 / T-00 whether better-auth's passkey challenge
fits in an elicitation message cleanly.

If the challenge is too large for a message string, fall back to:
the first call returns a `CallToolResult` containing the challenge
(as structured content) plus a `nextStep: "call auth_add_passkey
again with the attestation response"` instruction. The LLM then
makes a second `tools/call` to the same tool with the attestation
as the input. This avoids elicitation entirely for this tool —
simpler but less guided.

### 3. Client authenticator requirement

The tool's `description` must tell the LLM:

> "Adding a passkey requires a WebAuthn authenticator. If your
> host supports `navigator.credentials.create` (browser) or a
> passkey SDK, use it to complete the challenge. Otherwise, ask
> the user to complete the ceremony in a browser and paste the
> attestation response back."

The LLM cannot complete WebAuthn itself; it relays between the
user's browser / authenticator and this tool.

## Contract this ticket honors / establishes

- Honors `[C-AT]`, `[C-ELICIT]`.
- Demonstrates the two-round-trip elicitation pattern (challenge
  → attestation) — the first such use in the project.

## Do not do

- Do not implement WebAuthn client logic. The server side is
  better-auth; the client side is the LLM's host / browser.
- Do not list / delete passkeys here. Future `auth_list_passkeys`
  and `auth_remove_passkey` tools are out of scope for this plan.
- Do not assume the client SDK supports WebAuthn. The fallback is
  documented above.

## Verify

- `npm run build` passes.
- Manual real-mode smoke (requires a WebAuthn-capable client —
  e.g. a browser-based MCP client or a test harness with
  `virtual-authenticator`):
  1. Sign in via `auth_signin`.
  2. Call `auth_add_passkey` → tool returns challenge.
  3. Complete the challenge with the authenticator.
  4. Call `auth_add_passkey` again with the attestation → tool
     returns "Passkey added."
  5. Sign out, then attempt to sign in via the standard OAuth
     `/sign-in` page → passkey prompt appears → user authenticates
     → flow completes.
- The new passkey row exists in the `passkey` table.
