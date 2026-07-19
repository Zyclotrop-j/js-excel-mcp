# Scope & Process Changes — Real-Auth Initiative

Per BRIEFING_TO_THE_LEADS.md §11.2 (minor scope changes) and §11.4 (process changes),
this file records deviations from the default plan that the Project Lead (with Lead
Architect concurrence where required) authorized mid-flight.

---

## 2026-07-19 — Agent model fixes (process change)

**Trigger:** Three foundational agents returned empty `<task_result></task_result>`
without producing their artifacts on first dispatch:

- `researcher` (T-02 retry) — model `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`
- `junior-engineer-config` (T-10) — model `openrouter/openai/gpt-oss-20b:free`
- `junior-engineer-router` (T-11) — model `openrouter/openrouter/free-models-router`
  (also a double-prefix bug — the valid model ID is `openrouter/free-models-router`)

Confirmed-working reference: `lead-architect` (model `openrouter/z-ai/glm-5.2`)
completed the passkey-gap decision task successfully and produced all artifacts.

**Change:** Standardized the near-term dispatch roster on confirmed-working models from
the §11.3 approved menu. Agent files updated:

| Agent file | Old model | New model | Rationale |
|---|---|---|---|
| `researcher.md` | `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` | `openrouter/z-ai/glm-5.2` | Free model returned empty; z-ai confirmed working on lead-architect. |
| `junior-engineer-config.md` | `openrouter/openai/gpt-oss-20b:free` | `openrouter/z-ai/glm-5.2` | Free model returned empty. |
| `junior-engineer-router.md` | `openrouter/openrouter/free-models-router` | `openrouter/z-ai/glm-5.2` | Double-prefix bug AND free-models-router is on the approved menu as `openrouter/free-models-router` (no double prefix). Switched to z-ai for consistency with the working reference. |
| `junior-engineer-docs.md` | `openrouter/tencent/hy3:free` | `openrouter/z-ai/glm-5.2` | Same free-model family that failed for researcher; proactively switched before T-44/T-71 dispatch. |
| `engineer-followup.md` | `openrouter/openrouter/free-models-router` | `openrouter/z-ai/glm-5.2` | Double-prefix bug; switched to working model. |
| `code-reviewer.md` | `openrouter/openrouter/pareto-code` | `openrouter/pareto-code` | Double-prefix bug only — kept the intended strong-reviewer model. |
| `senior-engineer-auth-b.md` | `openrouter/openrouter/pareto-code` | `openrouter/pareto-code` | Double-prefix bug only — kept the intended strong-reviewer model. |
| `test-fixer.md` | `openrouter/openrouter/pareto-code` | `openrouter/pareto-code` | Double-prefix bug only — kept the intended strong-reviewer model. |

**Authority:** §11.3 (hiring/reusing models from the approved menu) and §11.4 (process
changes and reassigning tickets mid-flight). Both z-ai/glm-5.2 and pareto-code are on
the §11.3 approved menu. The previous commit "fix agent models" (29d6895) missed these
double-prefix entries; this change completes that fix.

**Risk:** Low. The agent *personas* are unchanged — only the backing model is swapped.
The Lead Architect's contract decisions are model-independent. The z-ai/glm-5.2 model is
the same one the lead-architect (contract owner) already uses, so contract-sensitive
review now happens on the same model that wrote the contracts.

**Untouched agents (left as-is):** `engineer-schema` (opencode-go/qwen3.7-plus),
`engineer-tools` (opencode-go/deepseek-v4-flash), `senior-engineer-auth-a`
(opencode/big-pickle), `senior-engineer-mcp` (openrouter/minimax/minimax-m3),
`senior-qa` (openrouter/deepseek/deepseek-v4-pro), `gpt-oss-20b-free`, `hy3-free`,
`test-reviewer`, `test-runner`, `test-writer`, `project-lead`, `lead-architect`.
These will be revisited if they fail on dispatch.

---

## 2026-07-19 — Task tool agent-file caching (process workaround)

**Trigger:** After fixing the agent model configs above, re-dispatched T-02, T-10, T-11
to `researcher`, `junior-engineer-config`, `junior-engineer-router` respectively. All
three returned empty `<task_result></task_result>` without producing any files. The
`junior-engineer-router` task errored with "Model not found:
openrouter/openrouter/free-models-router" — the OLD broken model string, despite the
agent file on disk showing the updated `openrouter/z-ai/glm-5.2`.

**Root cause hypothesis:** The opencode Task tool reads agent files at session start
and caches the model config. Mid-session edits to `.opencode/agent/*.md` are NOT
picked up by the running session. The `lead-architect` task worked earlier because its
model (`openrouter/z-ai/glm-5.2`) was correct from session start. The other agents'
models were broken at session start (double-prefix bugs + unreliable free models), so
even after fixing the files, the cached broken configs persist for this session.

**Workaround (authorized per §11.4 — "reassigning a ticket from one agent to another
mid-flight"):** Re-dispatch T-02, T-10, T-11 using the built-in `general` subagent
type, which uses the main opencode model (`z-ai/glm-5.2`) — the same model that the
`lead-architect` task used successfully. The agent-file personas, workflow, and
standing rules are inlined into the task prompts (the prompts were already
self-contained). The specialized agent files remain the canonical persona definitions
for future sessions (when opencode restarts and re-reads them).

**Risk:** None. The `general` agent uses the same model that wrote the contracts
(`lead-architect` is also `openrouter/z-ai/glm-5.2`). The persona inlining ensures
the standing rules (demo invariant, no new deps, surgical changes, etc.) are enforced.
The code-reviewer gate (T-NN PRs) still applies before merge.

**Mitigation for future sessions:** The agent file fixes above ARE persisted to disk.
A future opencode session (after the PL's current session ends) will read the corrected
models and the specialized agents can be used directly. For the current session, the PL
will use `general` for any agent whose model was broken at session start.

---

## 2026-07-19 — Lead Architect decision: passkey + API key + email-optional

**Trigger:** T-00 notes surfaced that `passkey` and `apiKey` plugins are NOT in the
`better-auth@1.6.23` main bundle. Four open questions for the architect.

**Decision (by Lead Architect, recorded in
`notes/arch-decision-passkey-and-related.md`):**

1. **Passkey (Option A'):** Install the official version-matched
   `@better-auth/passkey@^1.6.23` package. Passkey stays in MVP. No demo-invariant
   risk (demo never imports it). No contract *intent* change — only wording
   corrections in STUDY_FIRST.md §3 and [C-APIKEY].
2. **API key (T-30 Outcome B):** Install `@better-auth/api-key@^1.6.23`. Verifier
   accepts API keys directly via `auth.api.verifyApiKey`. T-30/T-52 use the native
   plugin APIs (`createApiKey`/`verifyApiKey`/`deleteApiKey`), NOT the names in their
   original ticket bodies — architect's notes added to those tickets.
3. **Magic-link + email-optional:** Email is truly optional (Strategy A, nullable
   `email TEXT UNIQUE`). Passkey-only accounts have `email = NULL`. Magic-link
   requires email (enforced by T-41's cross-field validation).
4. **Version pin:** Pin all three packages to `^1.6.23`.

**Not a scope change:** Option A' adds no feature surface, removes none, changes no
contract *intent*, adds no new dependency *category* (same auth category as
`better-auth`). Per §11.2 this is a contract *wording* adjustment under §11.1, not a
scope change. SCOPE_CHANGES.md is the correct place to record the dependency
additions and the agent-model fixes above (process changes), so they live here.

**PM2 impact:** Two new npm deps installed (`@better-auth/passkey`, `@better-auth/api-key`),
`better-auth` pinned `^1.6.11` → `^1.6.23`. PL ran `npx pm2 delete js-excel-mcp; npm install;
npx pm2 start ecosystem.config.cjs` — demo banner correct, `npm test` 90 ✓ unchanged,
OAuth discovery endpoint returns 200. Demo invariant holds.
