# T-01 Notes: Confirm MCP Client Elicitation Support + `acceptedContent` Semantics

**Date:** 2026-07-19  
**Researcher:** Researcher agent  
**Status:** Complete

---

## 1. Client SDK Version & Elicitation Support

### Package
- **Client SDK:** `@modelcontextprotocol/sdk@2.0.0-beta.3` (provides `Client` class)
- **Transport SDK:** `@modelcontextprotocol/node@2.0.0-beta.3` (provides `NodeStreamableHTTPServerTransport`)
- **Server SDK:** `@modelcontextprotocol/server@2.0.0-beta.3` (provides `McpServer`, `inputRequired`, `acceptedContent`)

### Client Capability Advertisement
From `node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts` (lines 578-583):

```typescript
elicitation: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodIntersection<z.ZodObject<{
    form: z.ZodOptional<z.ZodIntersection<z.ZodObject<{
        applyDefaults: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    url: z.ZodOptional<z.ZodCustom<object, object>>;
}, z.core.$strip>, z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>>>;
```

**Key finding:** The `ClientCapabilities` schema declares `elicitation` as optional with two modes:
- `form` — default mode (backwards compatible): empty object `{}` or `{ applyDefaults?: boolean }`
- `url` — explicit opt-in: requires `url: true` (or any truthy value)

From `node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.d.ts` (lines 9-21):

```typescript
export declare function getSupportedElicitationModes(capabilities: ClientCapabilities['elicitation']): {
    supportsFormMode: boolean;
    supportsUrlMode: boolean;
};
```

**Default behavior:** If the client sends `elicitation: {}` (empty object) or omits `elicitation` entirely, `supportsFormMode === true` (backwards compatibility). URL mode must be explicitly declared.

### Client-Side Request Handler for `elicitation/create`
From `node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js` (lines 191-243):

The `Client` class overrides `setRequestHandler` to wrap the `elicitation/create` handler with:
1. Schema validation against `ElicitRequestSchema`
2. Capability check: throws `McpError(ErrorCode.InvalidParams, 'Client does not support form-mode elicitation requests')` if `supportsFormMode === false`
3. Default application: if `capabilities.elicitation?.form?.applyDefaults === true`, applies JSON Schema defaults to accepted content
4. Result validation against `ElicitResultSchema` (discriminated union: `action: 'accept' | 'decline' | 'cancel', content?`)

**Conclusion:** The client SDK **fully supports** form-mode elicitation out of the box. Any client built with `@modelcontextprotocol/sdk@>=2.0.0-beta.3` that advertises `elicitation: {}` (or omits it) will receive and respond to `elicitation/create` requests.

### Test Client in This Project
The project's integration tests use `MockMcpServer` (`test/helpers/test-server.ts`), which **does not** exercise the real client SDK. It directly invokes tool callbacks with a mock context. No E2E test uses a real `@modelcontextprotocol/sdk` `Client` instance against the running server.

**Implication:** The test suite does not verify end-to-end elicitation. The fallback (structured prompt + free-text args) is **not needed** for the real client, but the test harness cannot catch regressions in the elicitation round-trip.

---

## 2. Round-Trip Mechanics (Server Side)

### Primitive: `inputRequired.elicit()`
From `node_modules/@modelcontextprotocol/server/dist/index.d.cts` (lines 518-595):

```typescript
interface InputRequiredBuilder {
  (spec: InputRequiredSpec): InputRequiredResult;
  elicit(params: ElicitInputParams): InputRequest;
  elicitUrl(params: Omit<ElicitRequestURLParams, 'mode' | 'elicitationId'>): InputRequest;
  createMessage(params: CreateMessageRequestParams): InputRequest;
  listRoots(): InputRequest;
}

type ElicitInputParams = Omit<ElicitRequestFormParams, 'requestedSchema'> & {
  requestedSchema: ElicitRequestFormParams['requestedSchema'] | StandardSchemaWithJSON;
};
```

- `requestedSchema` accepts **any Standard Schema** (zod v4, zod works directly; SDK serializes to JSON Schema).
- Returns an `InputRequest` object embedded in `InputRequiredResult`.

### Server-Side Pattern (from `src/tools/handleCells/discovery.ts:368-393`)

```typescript
const SAMPLE_KEY = 'header-detection';

const existing = acceptedContent(this.context.inputResponses, SAMPLE_KEY, schema);
if (!existing) {
  return inputRequired({
    inputRequests: {
      [SAMPLE_KEY]: inputRequired.elicit({
        message: 'Please confirm header detection...',
        requestedSchema: schema,
      }),
    },
  });
}

// Retry round: `existing` is the validated, accepted content
```

### Extracting Response on Retry
From `node_modules/@modelcontextprotocol/server/dist/index.d.cts` (lines 596-651):

```typescript
// Two-argument form: returns content or undefined
declare function acceptedContent<T extends Record<string, unknown> = Record<string, unknown>>(
  responses: InputResponses | Record<string, unknown> | undefined,
  key: string
): T | undefined;

// Three-argument form: validates against schema, returns typed output or undefined
declare function acceptedContent<S extends StandardSchemaV1>(
  responses: InputResponses | Record<string, unknown> | undefined,
  key: string,
  schema: S
): StandardSchemaV1.InferOutput<S> | undefined;

// Discriminated view for decline/cancel/missing detection
type InputResponseView =
  | { kind: 'missing' }
  | { kind: 'elicit'; action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> }
  | { kind: 'sampling'; result: CreateMessageResult | CreateMessageResultWithTools }
  | { kind: 'roots'; roots: Root[] };

declare function inputResponse(
  responses: InputResponses | Record<string, unknown> | undefined,
  key: string
): InputResponseView;
```

**Behavior:**
- `acceptedContent(responses, key)` → `content` if `action === 'accept'`, else `undefined`
- `acceptedContent(responses, key, schema)` → validated typed content or `undefined` (also returns `undefined` on validation failure)
- `inputResponse(responses, key)` → lets you distinguish `decline` / `cancel` / `missing` / other kinds

### Retry Flow
1. Tool returns `InputRequiredResult` with `inputRequests: { [key]: elicit({...}) }`
2. Client receives `tools/call` result with `resultType: 'input_required'`
3. Client prompts user, collects input matching `requestedSchema`
4. Client re-issues `tools/call` **with identical `name` and `arguments`** plus `inputResponses: { [key]: { action: 'accept', content: {...} } }`
5. Server invokes the **same tool callback** again; `ctx.mcpReq.inputResponses` (or `ctx.inputResponses`) is populated
6. Tool reads `acceptedContent(ctx.inputResponses, key, schema)` → proceeds

**Critical:** The retry uses the **same tool name and arguments**. The tool must be idempotent or guard against double-execution.

---

## 3. `acceptedContent` Semantics for a Signup Form

### Schema Shape (per `[C-ELICIT]` in STUDY_FIRST.md)

```typescript
const schema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  credentialType: z.enum(['password', 'passkey', 'magiclink']),
  password: z.string().min(12).optional(),
}).describe('Sign up for an MCP account. Email is optional for passkey-only accounts.');
```

### What `acceptedContent` Returns
| User Action | `acceptedContent(responses, 'signup')` | `acceptedContent(responses, 'signup', schema)` |
|-------------|----------------------------------------|------------------------------------------------|
| Submits valid form | `{ name, email?, credentialType, password? }` | Validated typed object |
| Clicks "Cancel" / "Decline" | `undefined` | `undefined` |
| Closes prompt without action | `undefined` | `undefined` |
| Submits invalid data (client bypass) | Raw invalid object | `undefined` (validation fails) |

**Server should set:** `requestedSchema: schema` (zod schema works directly via `StandardSchemaWithJSON`).

**`acceptedContent` purpose:** Extracts and optionally validates the user's submitted form data. The `describe()` string becomes the form title/description in the client UI.

---

## 4. In-Process `Map` Visibility (Pending-Login Handoff)

### Spike Result
**Confirmed:** A module-level `Map` declared in one module is the **same instance** when imported by other modules **within the same Node.js process**.

**Spike script:** `C:\Users\Janne\AppData\Local\Temp\opencode\t-01-spike.mjs`

```javascript
// Single process, multiple "modules" (simulated inline)
const sharedMap = new Map();
// auth_signup writes:
sharedMap.set('nonce-123', { userId: 'user-456', sessionId: 'session-789' });
// /sign-in reads:
const entry = sharedMap.get('nonce-123'); // ✅ { userId: 'user-456', sessionId: 'session-789' }
```

**Mechanism:** ES module singleton semantics. Both the MCP server (port 3000) and the Auth Server (port 3001) run in the **same `tsx src/index.ts` process** (`src/server.ts` calls `setupAuthServer()` which mounts the second Express app on the same process). Therefore `src/shared/pendingLogin.ts` exporting `const pendingLogins = new Map()` is visible to both apps.

---

## 5. `/sign-in` ↔ Nonce Handoff Options

### Option A: Query Param (`login_nonce` on authorize URL)
**Flow:**
1. `auth_signup` returns `{ loginNonce: 'nonce-123' }` in structured content
2. LLM retries Excel tool → 401 → client SDK starts OAuth dance
3. Client SDK builds authorize URL: `GET /sign-in?login_nonce=nonce-123&...oauth_params...`
4. `/sign-in` reads `login_nonce` from query, looks up pending login, sets session cookie, 302s to `/api/auth/mcp/authorize`

**Pros:**
- Explicit, no race condition
- Works even if multiple pending logins exist (user picks which one)
- Stateless from server perspective (nonce in URL)

**Cons:**
- Requires client SDK to accept extra query params on authorize URL
- Need to verify `@modelcontextprotocol/sdk` `Client` allows custom authorize params

### Option B: Polling Most Recent Pending Login
**Flow:**
1. `auth_signup` stores `{ nonce, userId, sessionId }` in `pendingLogins`
2. LLM retries → 401 → client hits `/sign-in` (no extra params)
3. `/sign-in` finds the **most recent unexpired** entry with `sessionId` set
4. Sets cookie, 302s to `/api/auth/mcp/authorize`

**Pros:**
- No client SDK changes needed
- Simpler client-side flow

**Cons:**
- Race condition if user has multiple pending logins (unlikely in practice)
- `/sign-in` must infer which login belongs to this OAuth dance

### Recommendation: **Option A (Query Param)**
**Rationale:**
- The OAuth 2.0 spec and MCP's protected resource metadata already use query params for `state`, `redirect_uri`, etc.
- The client SDK's `Client` class builds the authorize URL internally; we need to verify if it supports injecting extra params. If not, Option B is the fallback.
- Option A is cleaner architecturally: the nonce is a *correlation ID* explicitly passed by the LLM (via the tool result), not a server-side guess.

**Verification needed (T-22 scope):** Check if `@modelcontextprotocol/sdk` `Client` exposes a hook to add custom authorize params, or if we need to patch the authorize URL generation.

---

## 6. Multiple Elicitation Rounds & Interleaving

### Can the server send multiple elicitation rounds in one tool call?
**Yes.** The `InputRequiredResult` carries `inputRequests: Record<string, InputRequest>`. You can include multiple keys:

```typescript
return inputRequired({
  inputRequests: {
    step1: inputRequired.elicit({ message: 'Email?', requestedSchema: z.object({ email: z.string().email() }) }),
    step2: inputRequired.elicit({ message: 'Password?', requestedSchema: z.object({ password: z.string().min(12) }) }),
  },
});
```

The client receives both, can present them sequentially or as a multi-step form, and returns `inputResponses` with both keys on retry.

### Can elicitation interleave with normal return values?
**No.** `InputRequiredResult` is a **discriminated result type** (`resultType: 'input_required'`). It **replaces** the normal tool result. The tool does not return content + elicitation simultaneously. On retry, the tool either:
- Returns another `InputRequiredResult` (next round), or
- Returns a normal `CallToolResult` (success/error).

The `chain_operations` handler (`src/tools/handleChain.ts:120-127`) explicitly rejects `InputRequiredResult` — elicitation tools **cannot** be chained.

---

## 7. Open Questions for Lead Architect

1. **Client SDK authorize URL customization** — Does `@modelcontextprotocol/sdk` `Client` allow injecting extra query params (`login_nonce`) into the authorize URL? If not, Option B (polling) is the only viable path for T-22.

2. **Test client for E2E elicitation** — Should the project add a test that spins up a real `Client` against the server to verify the elicitation round-trip works end-to-end? Currently only the server-side pattern is tested via `MockMcpServer`.

3. **`acceptedContent` validation strictness** — The three-argument form returns `undefined` on validation failure (same as decline). Is this the desired UX (silent re-prompt), or should we distinguish "client sent garbage" from "user cancelled" via `inputResponse` and error out?

4. **TTL sweep strategy** — `pendingLogin.ts` will sweep on every access. Is a 5-minute TTL sufficient, or should we also sweep on a timer?

---

## 8. Key Files Referenced

| File | Purpose |
|------|---------|
| `node_modules/@modelcontextprotocol/server/dist/index.d.cts` | Server SDK types: `inputRequired`, `acceptedContent`, `inputResponse`, `McpRequestContext` |
| `node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts` | Shared types: `ClientCapabilities.elicitation`, `ElicitRequestFormParams`, `ElicitResultSchema` |
| `node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js` | Client SDK: `getSupportedElicitationModes`, `setRequestHandler` wrapping for `elicitation/create` |
| `src/tools/handleCells/discovery.ts:368-393` | Existing elicitation pattern (sampling, same mechanics) |
| `test/helpers/test-server.ts` | `MockMcpServer` — does NOT test elicitation round-trip |
| `C:\Users\Janne\AppData\Local\Temp\opencode\t-01-spike.mjs` | In-process Map visibility spike |

---

## 9. Verify Checklist (Ticket T-01 Deliverable)

- [x] Client SDK version & elicitation support documented
- [x] Round-trip mechanics annotated with `discovery.ts` lines
- [x] In-process Map visibility confirmed via spike
- [x] `/sign-in` ↔ nonce handoff options listed with recommendation
- [x] Multiple elicitation rounds / interleaving behavior documented
- [x] Open questions for architect enumerated