/**
 * T-72 §5 — Real-mode passkey suite (gated, optional).
 *
 * Self-skips when `MCP_AUTH_MODE !== 'real'`.
 * Also skips when no virtual WebAuthn authenticator is available in
 * the test harness (per the architect's note: "gated, optional").
 *
 * This file documents the known limitation: the test harness lacks a
 * virtual authenticator (e.g. `@noinline/virtual-authenticator` or
 * a Playwright `virtualAuthenticator`), so `auth_add_passkey`'s
 * two-call flow (register → verify) cannot be exercised end-to-end.
 * When a virtual authenticator becomes available, fill in the test
 * bodies below.
 */
import { strict as assert } from 'node:assert';

import { isRealMode } from './helpers.js';

export default function (test: any) {
    if (!isRealMode()) return;

    // Known limitation: no virtual WebAuthn authenticator in the test harness.
    // The passkey E2E smoke requires:
    //   1. `auth_add_passkey` action=register → returns a WebAuthn challenge.
    //   2. A virtual authenticator to complete the challenge (produce a
    //      RegistrationResponseJSON).
    //   3. `auth_add_passkey` action=verify with the attestation → stores passkey.
    //   4. Assert the passkey row exists in the DB.
    //
    // Without a virtual authenticator, step 2 cannot be performed.
    // This test suite is therefore a placeholder that documents the gap.
    //
    // To enable: install `@noinline/virtual-authenticator` (or equivalent)
    // and implement the test bodies below.

    test('real-auth passkey: SKIPPED — no virtual authenticator in test harness (T-72 §5 known limitation)', () => {
        // This test always passes — it documents the skip.
        assert.ok(true,
            'Passkey E2E smoke is gated on a virtual WebAuthn authenticator. ' +
            'See arch-decision-passkey-and-related.md §6 and T-72 §5.'
        );
    });
}
