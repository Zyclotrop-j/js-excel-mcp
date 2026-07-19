# Briefing to the Leads — Real-Auth Initiative

**From:** CTO / CPO
**To:** Project Lead (primary reader), Lead Architect (co-reader)
**Re:** End-to-end ownership of the `js-excel-mcp` real-auth initiative — from kickoff through closing
**Status:** Ready to start. Read this once, end-to-end, then begin Wave 1. Do not hand the project back to me until section 12 ("Project closing") is complete.

---

## 0. Your charter (read this first)

You — the **Project Lead** — are being chartered to **start AND end** this initiative, autonomously. You are not running a single wave or a single sprint. You own the project from the moment you finish reading this briefing until the moment you produce the closeout report described in section 12. If you hit a wall, you use the empowerment in section 11 first — contract changes, scope changes, hiring new agents, suspending standing rules with a recorded rationale — and only escalate to me (the CTO) as the absolute last resort when no other avenue remains.

The Lead Architect is your co-owner for design authority; the two of you together see this through. The 13 IC agents (and any you hire per section 11.3) are your workforce. I (the CTO) am available only for the escalations listed in section 11.5 — and those are deliberately narrow. Routine work, contract wordings, scope tweaks, hiring from the approved model menu, and process changes do not come back to me.

**Definition of "ended":** section 12, all six closeout items delivered. Anything short of that is a project still in progress. You decide when that bar is met; you do not need my sign-off to close.

---

## 1. Your mandate

Ship a real, switchable authentication mode for the `js-excel-mcp` server alongside the existing demo auth. The full plan, contracts, and 22 tickets live in this folder. Your job is to turn the plan into merged code without breaking demo mode and without violating the contracts.

The single env switch is `MCP_AUTH_MODE=demo|real` (default `demo`). Demo mode must remain **byte-for-byte identical** to today's behavior — this is invariant §8.1 in `STUDY_FIRST.md` and it is non-negotiable.

## 2. Read this before anything else

In this order:

1. `tickets/real-auth/README.md` — ticket index, difficulties, dependencies, parallelism waves, and the designed-to-be-pluggable follow-ups (mailer, DB).
2. `tickets/real-auth/STUDY_FIRST.md` — the shared knowledge document. Every `[C-XX]` contract is load-bearing; the Lead Architect owns these. §5 (the two-process-same-process trick), §6 (the token-handoff problem), §7 (contracts), and §8 (behavioral invariants) are the parts you will reference daily.
3. The ticket files themselves (`T-NN-*.md`) — read each ticket before dispatching it. Tickets are self-contained: Goal, Context, Scope, Contracts honored, "Do not do", and "Verify".

Do not let any IC start a ticket without having read `STUDY_FIRST.md` first. It is the contract surface that makes independent tickets fit together.

## 3. How the two of you split the job

**Project Lead** — operations. You own wave scheduling, ticket dispatch, dependency gating, the PM2 restart rhythm, blocker escalation, and notes hygiene under `tickets/real-auth/notes/`. You do NOT write production code, and you do NOT amend contracts. When reality demands a contract change, route it to the Lead Architect.

**Lead Architect** — design authority. You own `STUDY_FIRST.md`'s `[C-XX]` contracts, the resolution of the five open design risks (listed in your agent file), PR review authority over contract-sensitive files, and the power to veto dispatch when a ticket's design prerequisites aren't met. You do NOT run the test suite or restart PM2, and you do NOT dispatch routine work.

You co-own ticket assignment: the Project Lead proposes, the Lead Architect vetoes on contract/design grounds. For tickets that touch contracts or carry design risk (T-20, T-21, T-22, T-30, T-40, T-41, T-12, T-80, T-81), get the architect's sign-off before dispatch.

## 4. The team

Thirteen agents are defined in `.opencode/agent/`. The dispatch guide below is in your agent file too; reproduce it here for self-containment.

| Work | Assign to |
|---|---|
| 🟢 easy config / scaffolding | `junior-engineer-config` |
| 🟢 easy docs | `junior-engineer-docs` |
| 🟢 easy leftovers, small fixes, note-taking, scripts | `junior-engineer-router` |
| 🟡 medium schema / verifier | `engineer-schema` |
| 🟡 medium auth tools | `engineer-tools` |
| 🟡 medium pluggability follow-ups | `engineer-followup` |
| 🔴 hard auth-server (T-20/21/22) | `senior-engineer-auth-a` (primary) or `senior-engineer-auth-b` (pair/overflow) |
| 🔴 hard MCP bootstrap (T-40/41) | `senior-engineer-mcp` |
| Study tickets (T-00/01/02) | `researcher` |
| E2E tests (T-72) | `senior-qa` |
| Contract clarifications, design risks | `lead-architect` |
| PR review | `code-reviewer` (pareto-code — strong reviewer) |

Pairing note: when you want a writer/reviewer dynamic on the hardest auth-server ticket, put `senior-engineer-auth-a` (big-pickle) on the implementation and `senior-engineer-auth-b` (pareto-code) on in-flight pair review before the formal `code-reviewer` gate. When you need parallel throughput, give them different hard tickets.

## 5. The wave plan

From `README.md`. Run waves in order; within a wave, parallelize where the table says so.

- **Wave 1 (study, parallel):** T-00, T-01, T-02 → `researcher`. Block everything else until the three notes files exist.
- **Wave 2 (foundation, parallel after Wave 1):** T-10, T-11, T-12. T-12 depends on T-02's notes; T-10 and T-11 have no deps.
- **Wave 3 (auth server, sequential):** T-20 → T-21 → T-22. T-20 needs T-00 + T-02 notes + T-12. T-22 needs T-01 notes + T-11.
- **Wave 4 (parallel):** T-30 (after T-20) and T-40 (after T-20 + T-22).
- **Wave 5 (parallel after T-40):** T-41, T-50. Then T-42, T-43, T-51, T-52.
- **Wave 6 (docs/test):** T-70, T-71, T-72. T-70 and T-71 can go earlier if they unblock; T-72 is last.

The follow-up tickets T-80 (mailer pluggability) and T-81 (DB pluggability) are **not in the current waves** — they consume the slots T-20 bakes in. Schedule them after Wave 6 lands and the core real-auth flow is verified.

## 6. Immediate first actions (the kickoff checklist)

Do these in this order. Do not skip ahead.

1. **Confirm the baseline.** Run `npm test` and `npm run build` against the current `main`. Both must pass. If they don't, stop and surface the failure — the plan assumes a green baseline.
2. **Confirm the server starts in demo mode.** `npx pm2 start ecosystem.config.cjs` then `npx pm2 logs js-excel-mcp --lines 20 --nostream` — verify the banner shows demo mode and the OAuth discovery endpoint responds at `http://localhost:3001/.well-known/oauth-authorization-server`.
3. **Dispatch Wave 1.** Assign T-00, T-01, T-02 to the `researcher` in parallel. Tell the researcher: notes files land at `tickets/real-auth/notes/T-NN-notes.md`; escalate to the Lead Architect when facts end and judgment begins; never leave a "probably" in a notes file.
4. **Gate Wave 2 on Wave 1's notes.** Do not dispatch T-12 until `T-02-notes.md` exists with the email-optional DDL decision. Do not dispatch T-20 until `T-00-notes.md` exists with the plugin API names and `T-02-notes.md` exists with the options snippet.
5. **Stand up the `notes/` directory.** Create `tickets/real-auth/notes/` (empty) so the researcher has somewhere to write.

## 7. Operational norms (non-negotiable)

These apply to you and to every IC you dispatch:

- **Demo invariant.** `MCP_AUTH_MODE` unset or `demo` → behavior byte-for-byte identical to today. After every PR, the implementer runs `npm test` (demo) and confirms it passes. The `code-reviewer` blocks any PR that didn't verify this.
- **No `process.env` reads** outside `src/server.ts` and `src/shared/authMode.ts`.
- **No new npm deps** without a recorded Lead Architect decision in `tickets/real-auth/notes/`. T-80 (mailer) and T-81 (DB) are the only tickets allowed to add deps, and only after that decision.
- **No secrets logged** — backup codes, passwords, API keys, session cookies, OTPs never appear in `console.log` / `logger` / chain logs. They appear only in the single tool result where the ticket explicitly authorizes them.
- **Schema resets.** When the real-mode DDL changes, delete `data/_auth_real.db` before restart (per `AGENTS.md`). The PR that changes the DDL must say so in its "Verify" section.
- **PM2 rhythm.** After every merge that touches server startup, `npx pm2 restart js-excel-mcp` and check the banner. Use `npx pm2 delete js-excel-mcp && npx pm2 start ecosystem.config.cjs` after `ecosystem.config.cjs` changes or new deps.
- **Karpathy guardrails** (from `AGENTS.md`). Surgical changes, no speculative generality, no unrelated refactors, every changed line traces to the ticket's scope, surface assumptions rather than hiding them. Remind ICs as needed.

## 8. Decision rights at a glance

| Question | Decided by |
|---|---|
| Which ticket an IC picks up next | Project Lead (architect veto on contract-sensitive tickets) |
| Whether a `[C-XX]` contract changes | Lead Architect |
| Whether a new npm dep is allowed | Lead Architect (decision recorded in `notes/`) |
| Whether a PR merges | `code-reviewer` (architect co-sign for `src/shared/*` and `STUDY_FIRST.md`) |
| Whether a spike is needed | Researcher proposes, Lead Architect approves |
| Whether to skip a "Verify" step | Never. Block the PR. |

## 9. How to know the implementation is done (not the project)

The implementation is shippable when:

1. All 22 core tickets (T-00 through T-72) are merged.
2. `npm test` (demo) passes unchanged from the baseline you captured in step 1.
3. `npm run test:real-auth` passes (T-72's suites) against a fresh `data/_auth_real.db`.
4. A manual real-mode smoke completes the full LLM bootstrap: connect to `/mcp/bootstrap` → `auth_signup` → elicitation round trip → `{ loginNonce, backupCodes }` → retry Excel tool → OAuth dance → consent → bearer → Excel tool succeeds.
5. `MCP_AUTH_MODE=demo` (or unset) round-trips to today's behavior with no diff in the test output.
6. `AGENTS.md` documents the mode switch, the env table, and the schema-reset procedure.
7. `ecosystem.config.cjs` has the `env_real:` block and `--env real` starts the server in real mode.

T-80 and T-81 are explicit follow-ups and are not part of "implementation done" — the core plan must ship without them.

**Important:** reaching this point is *not* the end of the project. It is the trigger for section 10 (handoff) and section 12 (closing). Keep going.

## 10. Handoff (between implementation-done and project closing)

Before you close, you must hand off the initiative so that the operator (the repo owner, not me) can actually run it in production. Concretely:

1. **Operator runbook.** Produce `tickets/real-auth/notes/OPERATOR_RUNBOOK.md` with:
   - How to start in demo mode (unchanged command).
   - How to start in real mode (`npx pm2 start ecosystem.config.cjs --env real`), the required env vars, and the fail-fast rules if they're missing.
   - The schema-reset procedure (delete `data/_auth_real.db` when the DDL changes).
   - The user-facing description of the three signup paths (password / passkey / magic-link) and the recovery flow (backup codes), so the operator can document them for end users.
   - The known limitations (no SMTP transport until T-80; SQLite-only until T-81; passkey bootstrap uses a throwaway password; cross-user API-key revocation is out of scope).
   - Where to find the logs and what to look for in the startup banner.
2. **Sign-off walkthrough.** Walk the operator through the section-9 smoke once, end-to-end, in real mode. Record the transcript in `tickets/real-auth/notes/CLOSEOUT_SMOKE.md` (commands run, observed banner, observed responses, any deviations). If the smoke fails, do not close — go back and fix.
3. **Archive the tickets.** Move the per-ticket `T-NN-*.md` files into `tickets/real-auth/done/` (create the dir). Keep `README.md`, `STUDY_FIRST.md`, `BRIEFING_TO_THE_LEADS.md`, and the `notes/` files where they are — they're the record.
4. **Define "next time."** Write `tickets/real-auth/notes/FOLLOWUPS.md` listing T-80, T-81, and any other gaps you discovered during the run, with a one-sentence rationale for each and a recommended priority. This is the input to whatever initiative comes next.

## 11. Empowerment, decision authority, and escalation

You and the Lead Architect are **fully empowered to see this project through autonomously**. The defaults below are broad authorities granted up front; escalation to me is the **absolute last resort**, not the default path. Use it only when every other avenue is exhausted.

### 11.1 Contract changes

The Lead Architect may amend any `[C-XX]` contract in `tickets/real-auth/STUDY_FIRST.md` upon **deep review** — meaning: the existing contract has been read in full context, the implementer's PR has been read in full, the better-auth installed types have been checked, and the amendment is the only way to make the code correct. Amend surgically (preserve all other contracts), record a one-paragraph rationale at `tickets/real-auth/notes/arch-decision-<topic>.md`, and update every ticket whose "Contracts honored" section references the changed contract. You do not need my sign-off for contract changes.

### 11.2 Scope changes

The Project Lead, with Lead Architect concurrence, may change the scope of the initiative:

- **Minor scope changes** (adding/removing/rewriting a single ticket, splitting one ticket into two, merging two into one, reordering dependencies) — proceed and record the change in `tickets/real-auth/notes/SCOPE_CHANGES.md`.
- **Major scope changes** (adding a new feature surface, removing a planned feature surface, changing the number of waves, changing a `[C-XX]` contract's *intent* rather than its *wording*, adding a new npm dependency category) — **proceed as a last resort when no other option remains**. Document the decision in `SCOPE_CHANGES.md` with: trigger, options considered, why each non-major option was rejected, what the change is, and which tickets/contracts are affected. Proceed without my sign-off; the document is the audit trail.

### 11.3 Hiring new resources

The Project Lead may create new agents in `.opencode/agent/` (or `.opencode/agents/`) at any time if the existing 13 agents lack a capability the initiative needs. Concretely:

- Pick a model from the approved list (the same menu used to staff this team): `openrouter/openai/gpt-oss-20b:free`, `openrouter/tencent/hy3:free`, `opencode/z-ai/glm-5.2`, `opencode/big-pickle`, `opencode-go/qwen3.7-plus`, `opencode-go/deepseek-v4-flash`, `openrouter/minimax/minimax-m3`, `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`, `openrouter/deepseek/deepseek-v4-pro`, `openrouter/pareto-code`, `openrouter/free-models-router`. You may reuse a model on a new agent.
- Write the agent file following the same structure as the existing 13 (frontmatter with `description`, `mode: subagent`, `model`; a "Persona" section; a "What you own / don't own" section; a "How you work" section; standing rules; output style).
- Update this briefing's section 4 roster if the new agent is permanent, or note it in `SCOPE_CHANGES.md` if it's a one-off.
- Tell me in the closeout report (section 12) which agents you hired and why.

### 11.4 Any other project decisions

Anything not explicitly listed above — process changes, tooling choices, test-strategy adjustments, temporary suspension of a standing rule to unblock work, reassigning a ticket from one agent to another mid-flight, skipping a non-load-bearing "Verify" step and recording why, adopting a temporary lint/typecheck exception with a TODO — is yours and the Lead Architect's to decide. The standing rules in section 7 and the contracts in `STUDY_FIRST.md` are defaults, not a cage; if one is in the way, the Lead Architect can suspend it for a specific PR with a recorded rationale in the PR's notes.

### 11.5 When escalation to the CTO is appropriate

Bring me in **only** when **all** of the following are true:

- The Lead Architect has considered the question and produced a written analysis.
- The Project Lead has reviewed that analysis and tried at least one alternative path.
- The question is genuinely outside the team's authority — specifically: (a) a scope change that contradicts the initiative's mandate from section 1 (e.g. abandoning the demo invariant entirely), (b) a need for a model or capability that isn't on the approved menu and can't be substituted, or (c) a closeout smoke (section 10.2) that has failed and cannot be fixed within the existing ticket surface and the empowerment above.

Routine dispatch, routine review feedback, routine better-auth API questions, contract wordings adjustments, minor scope tweaks, and hiring new agents from the approved menu are **not** escalations. Do not bring me in just to confirm you're done — section 12 is the closeout, and it does not require my signature.

When you do escalate, come with the analysis, the alternatives you tried, and a specific ask. I will respond with a decision, not a discussion.

## 12. Project closing (this is what "ended" means)

The project is closed when **all six** of the following are true. You produce the closeout report as the final artifact; it is the last thing you write.

1. **Implementation done.** All seven items in section 9 are satisfied and verified.
2. **Operator runbook delivered.** `tickets/real-auth/notes/OPERATOR_RUNBOOK.md` exists and the operator (or the operator's delegate) has confirmed they can follow it to start in real mode.
3. **Closeout smoke recorded.** `tickets/real-auth/notes/CLOSEOUT_SMOKE.md` exists with a successful end-to-end real-mode transcript.
4. **Tickets archived.** All `T-NN-*.md` files are under `tickets/real-auth/done/`.
5. **Follow-ups recorded.** `tickets/real-auth/notes/FOLLOWUPS.md` lists T-80, T-81, and any other discovered gaps with priority.
6. **Closeout report produced.** Write `tickets/real-auth/CLOSEOUT_REPORT.md` with:
   - **What was shipped.** One paragraph.
   - **Tickets merged.** Table: `T-NN → assignee → status → PR/commit ref`.
   - **Contracts honored.** List of `[C-XX]` IDs, each with a one-line note on how the final implementation upheld it.
   - **Deviations from the plan.** Any place the final implementation diverged from the ticket's spec, with rationale. None is the expected answer; if there are deviations, the Lead Architect signed off on each.
   - **Known limitations.** Pulled from the operator runbook.
   - **Follow-ups.** Pulled from `FOLLOWUPS.md`.
   - **Final test status.** `npm test` (demo) and `npm run test:real-auth` both green, with the exact commit SHAs.
   - **Sign-off.** Project Lead and Lead Architect names, dated.

When the closeout report exists and all six items are true, the project is ended. You send me a single message: `"Real-auth initiative closed. Closeout report: tickets/real-auth/CLOSEOUT_REPORT.md."` That is the only closing message I want from you.

---

Start with section 6. Good luck.
