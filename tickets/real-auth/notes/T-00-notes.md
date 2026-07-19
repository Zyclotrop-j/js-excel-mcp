# T-00 Notes — better-auth Plugin Study (v1.6.23)

**Installed version:** `better-auth@1.6.23` (package.json pins `^1.6.11`)

---

## 1. passkey plugin

**Status: NOT AVAILABLE in v1.6.23**

- No `passkey` directory under `node_modules/better-auth/dist/plugins/`
- Not exported from `node_modules/better-auth/dist/plugins/index.d.mts`
- Not listed in `package.json` exports under `./plugins/`
- **Peer dependency check:** N/A — plugin doesn't exist

**Implication for T-02:** Email-optional passkey-only accounts are **not possible** with this version. If passkey support is required, a version upgrade (or different auth library) is needed. Flag for Lead Architect.

---

## 2. magicLink plugin

**Status: AVAILABLE**

**Import path:**
```ts
import { magicLink, type MagicLinkOptions } from 'better-auth/plugins'
```

**Plugin options (`MagicLinkOptions`):**
```ts
interface MagicLinkOptions {
  expiresIn?: number;                    // default: 300 (5 min)
  allowedAttempts?: number;              // deprecated, ignored (default 1)
  sendMagicLink: (data: {
    email: string;
    url: string;      // full magic link with token
    token: string;    // raw token
    metadata?: Record<string, any>;
  }, ctx?: GenericEndpointContext) => Awaitable<void>;
  disableSignUp?: boolean;               // default: false
  rateLimit?: { window: number; max: number }; // default: { window: 60, max: 5 }
  generateToken?: (email: string) => Awaitable<string>;
  storeToken?: 'plain' | 'hashed' | { type: 'custom-hasher'; hash: (token: string) => Promise<string> }; // default: 'plain'
}
```

**Endpoints / `auth.api.*` methods:**
| Endpoint | Method | Server API | Client API |
|----------|--------|------------|------------|
| `POST /sign-in/magic-link` | `signInMagicLink` | `auth.api.signInMagicLink(body, opts?)` | `authClient.signIn.magicLink(...)` |
| `GET /magic-link/verify` | `magicLinkVerify` | `auth.api.magicLinkVerify({ query: { token, callbackURL?, ... } }, opts?)` | `authClient.magicLink.verify(...)` |

**Request bodies:**
- `signInMagicLink`: `{ email: string; name?: string; callbackURL?: string; newUserCallbackURL?: string; errorCallbackURL?: string; metadata?: Record<string, any> }`
- `magicLinkVerify` (query): `{ token: string; callbackURL?: string; errorCallbackURL?: string; newUserCallbackURL?: string }`

**Response on verify:** `{ session: Session; user: User }` — establishes a real session.

**Mailer hook (`sendMagicLink`):** Called with `{ email, url, token, metadata? }`. Must be implemented by us (see `[C-MAILER]`). The `url` is the full verification link the user clicks.

**Database tables added:** None beyond core — magic link tokens stored in core `verification` table (type `magic-link`).

**Email-optional (T-02):** **No** — magic link requires an email to send to. A user with `email = null` cannot use magic link.

---

## 3. twoFactor.backupCodes plugin

**Status: AVAILABLE** (as sub-feature of `twoFactor` plugin)

**Import path:**
```ts
import { twoFactor, backupCode2fa, type TwoFactorOptions, type BackupCodeOptions } from 'better-auth/plugins'
```

**Plugin options (`BackupCodeOptions`):**
```ts
interface BackupCodeOptions {
  amount?: number;                    // default: 10
  length?: number;                    // default: 10
  customBackupCodesGenerate?: () => string[];
  storeBackupCodes?: 'plain' | 'encrypted' | { encrypt: (t: string) => Promise<string>; decrypt: (t: string) => Promise<string> };
  allowPasswordless?: boolean;        // default: false — allow backup codes without password when no credential account exists
}
```

**TwoFactor plugin options (`TwoFactorOptions`) include:**
```ts
interface TwoFactorOptions {
  issuer?: string;
  twoFactorTable?: string;            // default: 'twoFactor'
  totpOptions?: Omit<TOTPOptions, 'issuer'>;
  otpOptions?: OTPOptions;
  backupCodeOptions?: BackupCodeOptions;
  skipVerificationOnEnable?: boolean; // default: false
  allowPasswordless?: boolean;        // default: false — enable 2FA without password for passkey-only users
  // ... cookie ages, accountLockout, custom schema
}
```

**Endpoints / `auth.api.*` methods:**
| Endpoint | Method | Server API | Client API |
|----------|--------|------------|------------|
| `POST /two-factor/enable` | `enableTwoFactor` | `auth.api.enableTwoFactor({ body: { password?, issuer? } }, opts?)` | `authClient.twoFactor.enable(...)` |
| `POST /two-factor/disable` | `disableTwoFactor` | `auth.api.disableTwoFactor({ body: { password? } }, opts?)` | `authClient.twoFactor.disable(...)` |
| `POST /two-factor/verify-backup-code` | `verifyBackupCode` | `auth.api.verifyBackupCode({ body: { code, disableSession?, trustDevice? } }, opts?)` | `authClient.twoFactor.verifyBackupCode(...)` |
| `POST /two-factor/generate-backup-codes` | `generateBackupCodes` | `auth.api.generateBackupCodes({ body: { password? } }, opts?)` | `authClient.twoFactor.generateBackupCodes(...)` |
| (server-only) | `viewBackupCodes` | `auth.api.viewBackupCodes({ body: { userId } }, opts?)` | **none** |

**Key behaviors:**
- `enableTwoFactor` **returns** `{ totpURI: string; backupCodes: string[] }` — the plaintext backup codes are returned **once** to the caller. They are stored encrypted (default) or hashed in the `twoFactor.backupCodes` column.
- `generateBackupCodes` returns new codes, invalidating old ones. Returns `{ status: boolean; backupCodes: string[] }`.
- `verifyBackupCode` verifies a code, optionally creates a session (`disableSession: false` default), returns `{ token?, user }`.
- `viewBackupCodes` (server-only) decrypts and returns all codes for a `userId` — useful for admin/recovery flows.

**Database schema (added by `twoFactor` plugin):**
```sql
CREATE TABLE twoFactor (
  id TEXT PRIMARY KEY,
  userId TEXT REFERENCES user(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,           -- TOTP secret
  backupCodes TEXT NOT NULL,      -- encrypted/hashed JSON array
  verified BOOLEAN DEFAULT true,
  failedVerificationCount INTEGER DEFAULT 0,
  lockedUntil DATETIME
);
```
Also adds `user.twoFactorEnabled BOOLEAN DEFAULT false`.

**Can backup codes work without TOTP?**
- The `twoFactor` plugin **requires** at least one provider (TOTP, OTP, or backup codes) to be configured. However, `allowPasswordless: true` lets a user enable 2FA **without a password** if they have no credential account (e.g., passkey-only). Since passkey plugin doesn't exist in this version, this is moot for now.
- You **can** enable only `backupCodeOptions` and omit `totpOptions`/`otpOptions` — the plugin will only expose backup-code endpoints. Verified by inspecting the plugin factory: it conditionally registers endpoints based on which options are provided.

**Email-optional (T-02):** **Yes** — backup codes don't require email. A user with `email = null` can generate/use backup codes if they have a password or passkey credential. (Passkey N/A in this version.)

---

## 4. apiKey plugin

**Status: NOT AVAILABLE in v1.6.23**

- No `api-key` or `apiKey` directory under `plugins/`
- Not exported from plugins index
- Not in `package.json` exports

**Implication for `[C-APIKEY]`:** The plan's `auth_rotate_apikey` tool (T-52) cannot use a native better-auth plugin. Options:
1. Implement API keys ourselves (hash + store in custom table, verify in extended `tokenVerifier`).
2. Upgrade better-auth to a version that includes `apiKey` plugin (if exists in newer versions).
3. Use a separate library.

**Flag for Lead Architect (D-00-2).**

---

## 5. Interaction with `mcp` (OIDC) plugin

**MCP plugin endpoints:**
- `GET /.well-known/oauth-authorization-server` → `getMcpOAuthConfig`
- `GET /.well-known/oauth-protected-resource` → `getMCPProtectedResource`
- `GET /mcp/authorize` → `mcpOAuthAuthorize`
- `POST /mcp/token` → `mcpOAuthToken`
- `POST /mcp/register` → `registerMcpClient`
- `GET /mcp/get-session` → `getMcpSession` (used by `tokenVerifier`)

**Integration findings:**
- MCP plugin does **not** reference `apiKey`, `passkey`, or `magicLink` in its endpoints or hooks.
- `getMcpSession` only validates OAuth access tokens issued by the MCP token endpoint.
- No built-in bridge for API keys → MCP tokens.
- Magic link / backup code flows create standard better-auth sessions (cookie-based), which the MCP plugin's `after` hook can pick up for consent flow, but **API keys would need custom token-verifier extension**.

---

## 6. Email-optional summary (feeds T-02)

| Plugin | Requires email? | Works with `email = null`? |
|--------|-----------------|----------------------------|
| passkey | N/A (not in v1.6.23) | — |
| magicLink | **Yes** (sends to email) | **No** |
| backupCodes | No | **Yes** (if user has password/passkey credential) |
| apiKey | N/A (not in v1.6.23) | — |

---

## Decisions (for Lead Architect)

### **D-00-1: backup-codes-without-TOTP**
**Possible?** **Yes.** The `twoFactor` plugin accepts `backupCodeOptions` without `totpOptions` or `otpOptions`. Only backup-code endpoints are registered. Codes are generated on `enableTwoFactor` (returned once, stored encrypted by default) and can be regenerated via `generateBackupCodes`. Verification via `verifyBackupCode` creates a session.

**Action:** Proceed with backup-codes-only 2FA for T-41/T-43. No custom bcrypt needed.

---

### **D-00-2: API-key → MCP-token bridge**
**Does better-auth accept API keys at the token endpoint?** **No.** The `apiKey` plugin doesn't exist in v1.6.23. Even if it did, the MCP plugin's `mcpOAuthToken` endpoint only handles OAuth grants (authorization_code, refresh_token, client_credentials). No `grant_type=urn:ietf:params:oauth:grant-type:api-key` or similar.

**Options for T-30/T-52:**
1. **Extend `tokenVerifier`** (in `authServer.ts`) to also check `Authorization: Bearer mcp_...` against a custom `api_key` table (hash-verified). Simpler, no better-auth changes.
2. **Upgrade better-auth** to a version with `apiKey` plugin (if available) and verify it integrates with MCP token endpoint.
3. **Implement custom API key flow** outside better-auth entirely.

**Recommendation:** Option 1 — minimal, fits `[C-VF]` extension point. Flag for T-30.

---

### **D-00-3: passkey peer deps**
**Required?** **N/A** — passkey plugin not present in v1.6.23. If upgrading to a version with passkey, check for `@simplewebauthn/server` peer dep (common for WebAuthn).

---

### **D-00-4: Required plugin options for our use case**

**magicLink (T-20):**
```ts
magicLink({
  sendMagicLink: resolveMailer(cfg),  // [C-MAILER] — our console/webhook mailer
  disableSignUp: false,               // allow sign-up via magic link
  storeToken: 'hashed',               // don't store raw tokens
  expiresIn: 300,                     // 5 min
  rateLimit: { window: 60, max: 5 },
})
```

**twoFactor (backup codes only, T-41):**
```ts
twoFactor({
  backupCodeOptions: {
    amount: 10,
    length: 10,
    storeBackupCodes: 'encrypted',    // default, uses better-auth's crypto
    allowPasswordless: true,          // allow backup codes for users without password
  },
  // intentionally omit totpOptions and otpOptions
  allowPasswordless: true,            // top-level: allow 2FA enable without password
})
```

---

## Open Questions for Lead Architect

1. **Passkey requirement:** T-02 assumes passkey exists. Since it doesn't in v1.6.23, do we:
   - Upgrade better-auth (check version with passkey)?
   - Drop passkey from MVP and use magic-link + backup-codes only?
   - Implement WebAuthn ourselves?

2. **API key strategy:** Confirm Option 1 (extend `tokenVerifier` with custom API key table) is acceptable for T-30/T-52, or should we upgrade/find alternative?

3. **Magic link + email-optional:** Since magic link requires email, passkey-only accounts (email=null) can't use magic link. Is that acceptable, or do we need a synthetic email workaround?

4. **Version pin:** Should `package.json` be pinned to exact `1.6.23` (current) or allow `^1.6.11` to float? Study used installed 1.6.23.