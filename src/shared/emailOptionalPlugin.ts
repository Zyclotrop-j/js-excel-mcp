/**
 * Email-optional plugin for better-auth.
 *
 * Makes the core user.email column nullable while preserving UNIQUE.
 * Verified against @better-auth/core@1.6.23 dist/db/get-tables.mjs:
 * plugin schema fields spread OVER core fields, so this override takes effect.
 *
 * Spike-confirmed DDL output (npx @better-auth/cli generate):
 *   create table "user" (..., "email" text unique, ...)   ← NO "not null"
 *
 * IMPORTANT: Do NOT use `user: { fields: { email: { ... } } }` at the
 * top level of betterAuth({...}) — that option only renames columns and
 * silently does nothing for attribute overrides.
 *
 * @see tickets/real-auth/notes/T-02-notes.md §1.3
 */

import type { BetterAuthPlugin } from 'better-auth';

export const emailOptionalPlugin: BetterAuthPlugin = {
    id: 'email-optional' as const,
    schema: {
        user: {
            fields: {
                email: {
                    type: 'string',
                    required: false,   // ← overrides core's required: true
                    unique: true,      // ← preserved (unique-where-not-null)
                    fieldName: 'email',
                    sortable: true,
                },
            },
        },
    },
};
