import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';
import { magicLink } from 'better-auth/plugins/magic-link';
import { twoFactor } from 'better-auth/plugins/two-factor';

const db = new Database('data/_auth_real.db');

// The project's auth.ts manually creates tables - let me do the same for the real schema
db.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    twoFactorEnabled INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    expiresAt TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    userId TEXT NOT NULL REFERENCES user(id),
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    userId TEXT NOT NULL REFERENCES user(id),
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    accessTokenExpiresAt TEXT,
    refreshTokenExpiresAt TEXT,
    scope TEXT,
    password TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS twoFactor (
    id TEXT PRIMARY KEY,
    secret TEXT NOT NULL,
    backupCodes TEXT NOT NULL,
    userId TEXT NOT NULL REFERENCES user(id),
    verified INTEGER NOT NULL DEFAULT 1,
    failedVerificationCount INTEGER NOT NULL DEFAULT 0,
    lockedUntil TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
`);

const auth = betterAuth({
  database: db,
  baseURL: 'http://localhost:3000',
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      email: {
        type: 'string',
        required: false,
        unique: true,
      },
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url, token }) => {
        console.log(`  [magicLink] Would send to ${email}: ${url}`);
      },
    }),
    twoFactor({
      backupCodes: { enabled: true },
    }),
  ],
});

async function test() {
  console.log('\n=== Strategy B: Synthetic email @local.invalid ===');
  
  // Create a user with synthetic email
  const userId = 'user-' + Date.now();
  const syntheticEmail = `${userId}@local.invalid`;
  
  try {
    const user = await auth.api.signUpEmail({
      body: {
        name: 'Passkey Only User',
        email: syntheticEmail,
        password: 'password123',
      },
    });
    console.log('✓ Created user with synthetic email:', user.user);
  } catch (e) {
    console.log('✗ Failed to create user with synthetic email:', e.message);
    return;
  }

  // Check what's in the DB
  const users = db.prepare('SELECT * FROM user').all();
  console.log('All users:', users);

  console.log('\n=== Test magic-link with synthetic email ===');
  try {
    // Try to send magic link to the synthetic email
    const result = await auth.api.signInMagicLink({
      body: {
        email: syntheticEmail,
      },
    });
    console.log('Magic link sent:', result);
  } catch (e) {
    console.log('Magic link error:', e.message);
  }

  console.log('\n=== Test two-factor backup codes ===');
  // First need to sign in to get a session
  try {
    const signIn = await auth.api.signInEmail({
      body: {
        email: syntheticEmail,
        password: 'password123',
      },
    });
    console.log('Signed in:', signIn);
    
    // Try to generate backup codes (need session)
    // This will fail without proper session handling, but let's see the error
  } catch (e) {
    console.log('Sign in error:', e.message);
  }
}

test().catch(console.error).finally(() => db.close());