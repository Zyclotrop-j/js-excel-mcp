---
name: karpathy-guidelines
description: Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria.
license: MIT
---

# Server management with PM2

The MCP server runs under [PM2](https://pm2.keymetrics.io/) for process management (auto-restart, logs, back grounding). PM2 is a dev-dependency; all commands use `npx pm2`.

## Setup

| Action | Command |
|---|---|
| Start server | `npx pm2 start ecosystem.config.cjs` |
| Stop server | `npx pm2 delete js-excel-mcp` |
| Restart server | `npx pm2 restart js-excel-mcp` |
| View last 20 log lines | `npx pm2 logs js-excel-mcp --lines 20 --nostream` |
| Tail logs live | `npx pm2 logs js-excel-mcp` |
| List processes | `npx pm2 list` |

npm scripts are also defined: `npm run pm2:start`, `npm run pm2:stop`, `npm run pm2:restart`, `npm run pm2:logs`, `npm run pm2:status`.

The PM2 config lives in `ecosystem.config.cjs` at the project root.

## Notes

- The server listens on port 3000; an OAuth authorization server runs on port 3001.
- Data lives in `data/*.db` (SQLite via `better-sqlite3`). If you change the schema in `src/filesystem/system.ts`, **delete the old `.db` files** before restarting — the tables use `CREATE TABLE IF NOT EXISTS` which won't add columns to an existing table:

  ```
  npx pm2 stop js-excel-mcp
  Remove-Item data\*.db -Force   # PowerShell
  npx pm2 start ecosystem.config.cjs
  ```

- Always do `pm2 delete` + `pm2 start` (not just `pm2 restart`) after updating `ecosystem.config.cjs` or adding new dependencies — restart alone may not pick up all changes.

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
