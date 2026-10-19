import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node', include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'], fileParallelism: false, testTimeout: 60_000, hookTimeout: 60_000,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://postgres@localhost:5433/betmind_test', BETMIND_TEST_MODE: '1', BETMIND_DISABLE_WORKER: '1', AUTH_SECRET: 'test-secret-test-secret-test-secret', GROQ_API_KEY: 'test-key', GOOGLE_GENERATIVE_AI_API_KEY: 'test-key', APP_BASE_URL: 'http://localhost:3100' },
  },
});
