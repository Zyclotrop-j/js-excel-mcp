# T-02 — Spike: email-optional user schema with passkey-only accounts

- **Difficulty:** 🔴 hard
- **Type:** Study + throwaway spike (no production code merged)
- **Dependencies:** T-00 (need to know passkey plugin's email requirements)
- **Output:** `tickets/real-auth/notes/T-02-notes.md`
- **Blocks:** T-12 (the real-mode schema is gated on this decision)

## Goal

Decide and document exactly how the real-mode `user` table handles
email being optional while still supporting:

- passkey-only accounts (no email at all),
- password accounts (email required — it's the login identifier),
- magic-link accounts (email required — it's the delivery channel),
- backup-code recovery (works for any of the above).

## Why this first

better-auth's core schema marks `email` as `NOT NULL UNIQUE`. The
plan calls for email to be optional. The mismatch must be resolved
by config or by a synthetic-email convention **before** T-12 writes
the schema DDL — otherwise T-12, T-20, and every auth tool will
rework the user model.

## Scope

1. **Re-read T-00 notes** — specifically the email-optional
   interaction rows for each plugin. T-00 must be done first.
2. **Decide between two strategies:**

   - **Strategy A — Make `email` nullable.** Configure better-auth
     with `user: { fields: { email: { required: false, unique: true } } }`
     (or whatever the installed version's option shape is — T-00
     confirms). Confirm the `passkey` plugin still works with a
     `null` email. Confirm better-auth does not enforce email
     presence at the `signUpEmail` level when password is not used.

   - **Strategy B — Synthetic email.** Always store an email, but
     for passkey-only accounts use `{userId}@local.invalid`. The
     `local.invalid` TLD is reserved by RFC 6761 and can never
     resolve. Document this convention in the user-facing signup
     flow (the email is never sent anything for passkey-only
     accounts). Pros: no schema deviation from better-auth core.
     Cons: lying column.

3. **Spike it.** Create a throwaway script in
   `C:\Users\Janne\AppData\Local\Temp\opencode\t-02-spike.mjs`
   that:
   - constructs a `betterAuth({...})` instance with the chosen
     strategy,
   - creates a user without an email (Strategy A) or with a
     synthetic email (Strategy B),
   - confirms the user row exists and is queryable,
   - attempts to register a passkey for that user (mock the
     WebAuthn challenge if needed — this just confirms the plugin
     accepts a user with the chosen email state),
   - attempts to generate backup codes for that user.
   Do **not** commit the spike script. Do **not** modify the
   project's `data/_auth.db`. Use a temp DB path
   (`C:\Users\Janne\AppData\Local\Temp\opencode\t-02-spike.db`).

4. **Record the decision.** Pick A or B. Document:
   - the exact better-auth options snippet T-20 must use,
   - the exact DDL for the `user` table T-12 must write (for
     Strategy A: `email TEXT UNIQUE` without `NOT NULL`; for
     Strategy B: `email TEXT NOT NULL UNIQUE` with a `CHECK` or
     application convention that synthetic emails end in
     `@local.invalid`),
   - any plugin option that needs to be set so plugins tolerate
     the chosen strategy (e.g. `passkey: { requireEmail: false }`
     if such an option exists — T-00 confirms).

5. **Edge: unique-constraint collision.** If Strategy A and two
   users both have `email = NULL`, does SQLite's `UNIQUE` constraint
   allow that? (Yes — SQLite treats multiple NULLs as distinct for
   `UNIQUE`.) Confirm this is the installed `better-sqlite3` version's
   behavior. If somehow it isn't, fall back to Strategy B.

6. **Edge: signup without email through the `auth_signup` tool.**
   When `credentialType = 'passkey'` and no email is supplied, the
   tool must call the better-auth API in the way the spike confirms
   works. Document the exact `signUpEmail` (or alternative) call
   shape — T-41 will use it verbatim.

## Deliverable

`tickets/real-auth/notes/T-02-notes.md` with:

- **Decision: Strategy A or B** — one sentence.
- **Better-auth options snippet** — copy-paste-ready for T-20.
- **User-table DDL** — copy-paste-ready for T-12.
- **Spike log** — what you ran, what you observed, why the
  decision follows from the observations.
- **Plugin options that depend on this decision** — for T-20 and
  T-41.

## Do not do

- Do not commit the spike script.
- Do not touch `data/_auth.db` or `data/_auth_real.db`.
- Do not write production schema files. T-12 owns that.

## Verify

A fresh throwaway spike DB exists in the temp dir (or was deleted
after running). The notes file has a one-sentence decision and
copy-paste-ready DDL + options snippet. T-12 can be implemented by
pasting from the notes without re-investigating.
