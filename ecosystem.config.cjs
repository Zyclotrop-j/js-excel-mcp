module.exports = {
    apps: [{
        name: 'js-excel-mcp',
        script: 'node_modules/tsx/dist/cli.mjs',
        args: 'src/index.ts',
        cwd: __dirname,
        watch: false,
        autorestart: true,
        max_restarts: 10,
        // Demo mode (default). MCP_AUTH_MODE unset → demo.
        env: {
            NODE_ENV: 'development',
        },
        // Real mode: `npx pm2 start ecosystem.config.cjs --env real`
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
            // MCP_AUTH_PASSKEY_RP_ID: 'localhost',
            // MCP_AUTH_PASSKEY_RP_NAME: 'js-excel-mcp Auth',
        },
    }]
};
