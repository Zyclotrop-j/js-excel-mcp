# T-70 — `ecosystem.config.cjs` env vars for real mode

- **Difficulty:** 🟢 easy
- **Type:** Docs / env
- **Dependencies:** T-10 (`AuthConfig` env list is canonical)
- **Output:** `ecosystem.config.cjs` updated with all real-mode env vars

## Goal

Make PM2 start the server with all the env vars real mode needs.
Demo mode stays the default (no `MCP_AUTH_MODE` in the config —
unset means demo).

## Scope

### 1. Read `ecosystem.config.cjs`

Understand the existing `env:` block. The current file sets a
handful of env vars; don't replace them, extend.

### 2. Add real-mode env vars as comments + an `env_real` block

PM2 supports named environments via `pm2 start ecosystem.config.cjs
--env real`. Add a second `env_real:` block alongside the existing
`env:` (which becomes `env_demo` semantically — the default). The
operator switches modes with `--env`.

```js
// ecosystem.config.cjs (sketch — match the existing file's style)
module.exports = {
  apps: [{
    name: 'js-excel-mcp',
    script: 'dist/types/index.js',
    env: {
      // Demo mode (default). MCP_AUTH_MODE is unset → demo.
      NODE_ENV: 'development',
    },
    env_real: {
      NODE_ENV: 'production',
      MCP_AUTH_MODE: 'real',
      MCP_AUTH_BIND_HOST: 'localhost',          // or '0.0.0.0' for external
      MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
      AUTH_SECRET: 'CHANGE_ME',                 // operator MUST override
      MCP_AUTH_ALLOW_USER_SIGNUP: '1',
      MCP_AUTH_OTP_TRANSPORT: 'console',        // or 'webhook'
      // MCP_AUTH_OTP_WEBHOOK_URL: 'https://...',
      MCP_AUTH_DB_BACKEND: 'sqlite',            // or 'turso' (T-81)
      // MCP_AUTH_DB_URL: 'libsql://...',
      // MCP_AUTH_DB_AUTH_TOKEN: '...',
    }
  }]
};
```

### 3. Document the operator commands in `AGENTS.md` (T-71 owns the section; this ticket adds the commands)

```
npx pm2 start ecosystem.config.cjs --env real
npx pm2 restart js-excel-mcp --env real
```

vs the existing:

```
npx pm2 start ecosystem.config.cjs            # demo mode (default)
```

### 4. Don't break demo

`npx pm2 start ecosystem.config.cjs` (no `--env`) must produce
demo behavior. Verify the `env` block is the default.

## Contract this ticket honors

- Honors `[C-ENV]` (the env var names are exactly T-10's canonical
  list).

## Do not do

- Do not put real secrets in the committed file. `AUTH_SECRET:
  'CHANGE_ME'` is a placeholder; operators override via their own
  PM2 setup or a `.env` file their PM2 reads (out of scope here).
- Do not add env vars for the `MCP_AUTH_OTP_MAILER_FN` /
  `MCP_AUTH_DB_BACKEND=custom` advanced slots — those are programmatic,
  not env-driven; document in T-71 instead.

## Verify

- `npx pm2 start ecosystem.config.cjs` → server starts in demo
  mode (banner says `mode=demo`), existing tests pass.
- `npx pm2 start ecosystem.config.cjs --env real` → server starts
  in real mode (banner says `mode=real`).
- `npx pm2 delete js-excel-mcp && npx pm2 start ecosystem.config.cjs`
  round-trips cleanly (no orphan processes).
