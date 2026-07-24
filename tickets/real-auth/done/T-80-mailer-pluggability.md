# T-80 — Plug in a real mailer (SendGrid / Postmark / etc.) behind the `OtpMailer` slot

- **Difficulty:** 🟡 medium
- **Type:** Follow-up (designed-in pluggability; not in the current waves)
- **Dependencies:** T-20 (the `OtpMailer` slot must exist)
- **Output:** `src/shared/mailer/sendgridMailer.ts` (or similar) + env wiring in `loadAuthConfig`
- **Does NOT block:** the core plan — real auth works with `consoleMailer` / `webhookMailer` until this lands.

## Goal

Replace the default `consoleMailer` with a real email transport so
magic-link and email-verification flows deliver actual mail to users.
The pluggability was baked into T-20 — this ticket is the first real
consumer.

## Context (read before starting)

- `[C-MAILER]` in `STUDY_FIRST.md` — the `OtpMailer` interface and
  the `otpMailer?: OtpMailer` slot on `AuthConfig`.
- The existing `resolveMailer` in `src/shared/mailer.ts` (created in
  T-20) picks between `consoleMailer` and `webhookMailer`. This
  ticket adds a third built-in: `sendgridMailer` (or any other
  provider the operator chooses).

## Scope

1. Choose a provider based on operator preference (SendGrid is the
   reference impl). Add the SDK as a dependency (`@sendgrid/mail`
   or equivalent). This is the **one** ticket in the follow-up
   family that's allowed to add an npm dep.
2. Implement `sendgridMailer(opts: { apiKey: string; from: string;
   replyTo?: string }): OtpMailer` in
   `src/shared/mailer/sendgridMailer.ts`. It must:
   - Accept the `OtpMailerRequest` shape (to / otp / magicLink /
     userId / flow).
   - Render a plain-text + HTML body. The HTML template lives in
     `src/shared/mailer/templates/` (new dir).
   - Send via the SDK and surface failures (return a rejected
     promise; better-auth will translate that to a 5xx on the
     magic-link call).
3. Extend `AuthConfig` (in `authMode.ts`) with:
   ```ts
   otpTransport: 'console' | 'webhook' | 'sendgrid' | 'custom';
   otpSendgrid?: { apiKey: string; from: string; replyTo?: string };
   ```
   Keep backward-compat — `'custom'` means "use the `otpMailer`
   function slot directly". Add the matching env vars:
   `MCP_AUTH_OTP_TRANSPORT=sendgrid`,
   `MCP_AUTH_OTP_SENDGRID_API_KEY`,
   `MCP_AUTH_OTP_SENDGRID_FROM`,
   `MCP_AUTH_OTP_SENDGRID_REPLY_TO`.
4. Extend `resolveMailer(cfg)` to dispatch to `sendgridMailer` when
   `cfg.otpTransport === 'sendgrid'`.
5. Tests: a small integration test that mocks the SendGrid SDK and
   asserts `resolveMailer` returns a mailer that, when called with
   an `OtpMailerRequest`, posts the expected payload. Real-send
   tests are out of scope (CI must not send mail).
6. Document the env switch in `AGENTS.md` (T-71 owns the original
   real-mode section; this is an addendum, so reopen that section).

## Contract this ticket honors

- `[C-MAILER]` — the function slot.
- `[C-ENV]` — no `process.env` reads outside `server.ts` / `authMode.ts`'s
  `loadAuthConfig`.

## Do not do

- Do not change the better-auth plugin options shape (T-20 wired
  `sendMagicLink: resolveMailer(cfg)` once; this ticket only
  changes what `resolveMailer` returns).
- Do not change any auth tool or any schema.
- Do not introduce a queue / outbox / retry layer — that's a
  separate concern. Failures bubble up; better-auth logs them.

## Verify

- `MCP_AUTH_OTP_TRANSPORT=sendgrid` with valid SendGrid env → magic
  link email arrives in the user's inbox.
- `MCP_AUTH_OTP_TRANSPORT=console` → behavior unchanged from T-20.
- `npm test` passes; the SendGrid SDK is mocked, no real sends.
