// jest.setup.js — runs before all tests
require('dotenv').config({ path: '.env.test' });

// Use test database — fail fast if not configured
if (!process.env.TEST_DATABASE_URL) {
  console.error('\n[jest.setup] TEST_DATABASE_URL not set.');
  console.error('Copy .env.example to .env.test and set TEST_DATABASE_URL.\n');
  console.error('Example: TEST_DATABASE_URL=postgresql://balanzify_test:pass@localhost:5432/balanzify_test\n');
  process.exit(1);
}

// Prisma uses DATABASE_URL — point it at the test database
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Use a different port so tests don't conflict with a running dev server
process.env.PORT        = '5099';
process.env.NODE_ENV    = 'test';
process.env.JWT_SECRET  = 'test-jwt-secret-balanzify-minimum-64-chars-long-for-security-reasons-here';
process.env.LOG_LEVEL   = 'error';   // suppress request logs during tests
process.env.REDIS_URL   = '';         // disable Redis — use in-memory rate limiting

jest.setTimeout(45000); // 45s — integration tests hit the DB
