import { defineConfig } from '@playwright/test';
import { createHash } from 'node:crypto';
const PORT = 3200;
export default defineConfig({
  testDir: 'tests/e2e', timeout: 120_000, workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {} },
  webServer: {
    command: 'node scripts/start.mjs', port: PORT, reuseExistingServer: false, timeout: 60_000,
    env: { PORT: String(PORT), APP_BASE_URL: `http://localhost:${PORT}`, DATABASE_URL: process.env.E2E_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_e2e', BETMIND_TEST_MODE: '1', BETMIND_E2E_FAKES: '1', AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-xx', OWNER_ACCESS_CODE_HASH: createHash('sha256').update('P11ADMIN0123456789ABCDEF0123456789ABCDEF').digest('hex'), GROQ_API_KEY: 'fake', GOOGLE_GENERATIVE_AI_API_KEY: 'fake', NODE_ENV: 'production' },
  },
});
