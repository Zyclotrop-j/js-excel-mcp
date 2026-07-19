/**
 * Unit tests for `loadAuthConfig` in `src/shared/authMode.ts` (T-10).
 *
 * Covers the demo-default path (no env), and the four real-mode fail-fast
 * rules from T-10 ("Fail-fast rules"), plus the real-mode happy path that
 * parses the CORS CSV and derives `trustedOrigins` from `baseURL`.
 *
 * Each test snapshots and restores `process.env` so the suite is hermetic
 * (the project's other unit tests rely on a clean demo-default env).
 */
import { strict as assert } from 'assert';
import { loadAuthConfig, DEMO_SECRET } from '../../src/shared/authMode.js';

export default function (test: any) {
    const REAL_BASE = 'http://localhost:3000';

    function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
        const snapshot: Record<string, string | undefined> = {};
        const keys = new Set<string>(Object.keys(env));
        for (const k of keys) {
            snapshot[k] = process.env[k];
            const v = env[k];
            if (v === undefined) {
                delete process.env[k];
            } else {
                process.env[k] = v;
            }
        }
        try {
            fn();
        } finally {
            for (const k of keys) {
                if (snapshot[k] === undefined) delete process.env[k];
                else process.env[k] = snapshot[k] as string;
            }
        }
    }

    test('loadAuthConfig: demo default (no env) returns hardcoded defaults', () => {
        withEnv({ MCP_AUTH_MODE: undefined }, () => {
            const cfg = loadAuthConfig(REAL_BASE);
            assert.equal(cfg.mode, 'demo');
            assert.equal(cfg.dbPath, 'data/_auth.db');
            assert.equal(cfg.bindHost, 'localhost');
            assert.deepEqual(cfg.corsOrigins, ['*']);
            assert.equal(cfg.secret, DEMO_SECRET);
            assert.equal(cfg.secret, 'ernCjBsavZjKxznbu_1g1g');
            assert.equal(cfg.allowUserSignup, true);
            assert.deepEqual(cfg.trustedOrigins, [REAL_BASE]);
            assert.equal(cfg.otpTransport, 'console');
            assert.equal(cfg.dbBackend, 'sqlite');
            assert.equal(cfg.otpWebhookUrl, undefined);
            assert.equal(cfg.otpMailer, undefined);
            assert.equal(cfg.databaseBackend, undefined);
        });
    });

    test('loadAuthConfig: explicit MCP_AUTH_MODE=demo behaves like unset', () => {
        withEnv({ MCP_AUTH_MODE: 'demo' }, () => {
            const cfg = loadAuthConfig(REAL_BASE);
            assert.equal(cfg.mode, 'demo');
            assert.deepEqual(cfg.corsOrigins, ['*']);
            assert.equal(cfg.secret, DEMO_SECRET);
        });
    });

    test('loadAuthConfig: real mode with missing AUTH_SECRET throws', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: undefined,
                BETTER_AUTH_SECRET: undefined,
                MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000'
            },
            () => {
                assert.throws(
                    () => loadAuthConfig(REAL_BASE),
                    /AUTH_SECRET|BETTER_AUTH_SECRET/
                );
            }
        );
    });

    test('loadAuthConfig: real mode with valid env parses corsOrigins CSV', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 'real-secret-value-12345',
                MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000, http://localhost:5173 ',
                MCP_AUTH_DB_BACKEND: 'sqlite',
                MCP_AUTH_ALLOW_USER_SIGNUP: '0'
            },
            () => {
                const cfg = loadAuthConfig(REAL_BASE);
                assert.equal(cfg.mode, 'real');
                assert.equal(cfg.secret, 'real-secret-value-12345');
                assert.deepEqual(cfg.corsOrigins, ['http://localhost:3000', 'http://localhost:5173']);
                assert.equal(cfg.dbPath, 'data/_auth_real.db');
                assert.equal(cfg.bindHost, 'localhost');
                assert.equal(cfg.allowUserSignup, false);
                assert.deepEqual(cfg.trustedOrigins, [REAL_BASE]);
                assert.equal(cfg.otpTransport, 'console');
                assert.equal(cfg.dbBackend, 'sqlite');
            }
        );
    });

    test('loadAuthConfig: real mode prefers AUTH_SECRET over BETTER_AUTH_SECRET', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 'primary-secret',
                BETTER_AUTH_SECRET: 'fallback-secret',
                MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000'
            },
            () => {
                const cfg = loadAuthConfig(REAL_BASE);
                assert.equal(cfg.secret, 'primary-secret');
            }
        );
    });

    test('loadAuthConfig: real mode accepts BETTER_AUTH_SECRET alone', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: undefined,
                BETTER_AUTH_SECRET: 'better-auth-secret',
                MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000'
            },
            () => {
                const cfg = loadAuthConfig(REAL_BASE);
                assert.equal(cfg.secret, 'better-auth-secret');
            }
        );
    });

    test('loadAuthConfig: real mode refuses CORS="*" (dangerous default)', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 's',
                MCP_AUTH_CORS_ORIGINS: '*'
            },
            () => {
                assert.throws(
                    () => loadAuthConfig(REAL_BASE),
                    /\*|explicit origin list/
                );
            }
        );
    });

    test('loadAuthConfig: real mode with missing CORS throws', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 's',
                MCP_AUTH_CORS_ORIGINS: undefined
            },
            () => {
                assert.throws(
                    () => loadAuthConfig(REAL_BASE),
                    /MCP_AUTH_CORS_ORIGINS/
                );
            }
        );
    });

    test('loadAuthConfig: real mode with empty CORS CSV throws', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 's',
                MCP_AUTH_CORS_ORIGINS: ' , , '
            },
            () => {
                assert.throws(
                    () => loadAuthConfig(REAL_BASE),
                    /at least one origin/
                );
            }
        );
    });

    test('loadAuthConfig: real mode webhook transport without URL throws', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 's',
                MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000',
                MCP_AUTH_OTP_TRANSPORT: 'webhook',
                MCP_AUTH_OTP_WEBHOOK_URL: undefined
            },
            () => {
                assert.throws(
                    () => loadAuthConfig(REAL_BASE),
                    /webhook|MCP_AUTH_OTP_WEBHOOK_URL/
                );
            }
        );
    });

    test('loadAuthConfig: real mode webhook transport with URL parses', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 's',
                MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000',
                MCP_AUTH_OTP_TRANSPORT: 'webhook',
                MCP_AUTH_OTP_WEBHOOK_URL: 'https://hooks.example.com/otp'
            },
            () => {
                const cfg = loadAuthConfig(REAL_BASE);
                assert.equal(cfg.otpTransport, 'webhook');
                assert.equal(cfg.otpWebhookUrl, 'https://hooks.example.com/otp');
            }
        );
    });

    test('loadAuthConfig: real mode non-sqlite backend without DB_URL throws', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 's',
                MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000',
                MCP_AUTH_DB_BACKEND: 'turso',
                MCP_AUTH_DB_URL: undefined
            },
            () => {
                assert.throws(
                    () => loadAuthConfig(REAL_BASE),
                    /MCP_AUTH_DB_URL|turso/
                );
            }
        );
    });

    test('loadAuthConfig: real mode non-sqlite backend with DB_URL parses', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 's',
                MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000',
                MCP_AUTH_DB_BACKEND: 'postgres',
                MCP_AUTH_DB_URL: 'postgres://user:pass@host:5432/auth',
                MCP_AUTH_DB_AUTH_TOKEN: 'tok'
            },
            () => {
                const cfg = loadAuthConfig(REAL_BASE);
                assert.equal(cfg.dbBackend, 'postgres');
                assert.equal(cfg.dbUrl, 'postgres://user:pass@host:5432/auth');
                assert.equal(cfg.dbAuthToken, 'tok');
            }
        );
    });

    test('loadAuthConfig: real mode merges AUTH_TRUSTED_ORIGINS into trustedOrigins', () => {
        withEnv(
            {
                MCP_AUTH_MODE: 'real',
                AUTH_SECRET: 's',
                MCP_AUTH_CORS_ORIGINS: 'http://localhost:3000',
                AUTH_TRUSTED_ORIGINS: 'https://app.example.com, https://admin.example.com'
            },
            () => {
                const cfg = loadAuthConfig(REAL_BASE);
                assert.deepEqual(cfg.trustedOrigins, [
                    REAL_BASE,
                    'https://app.example.com',
                    'https://admin.example.com'
                ]);
            }
        );
    });
}
