const num = (name: string, fallback: number) => {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

/** Server-side configuration. Every limit is a hard cap enforced in code. */
export const config = {
  appBaseUrl: (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  timezone: process.env.APP_TIMEZONE || 'Europe/Bucharest',
  databaseUrl: process.env.DATABASE_URL || '',
  authSecret: process.env.AUTH_SECRET || '',
  ownerAccessCodeHash: process.env.OWNER_ACCESS_CODE_HASH || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  groqApiKey: process.env.GROQ_API_KEY || '',
  geminiApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  /** Daily spend cap for paid OpenRouter models (USD, UTC day). Over the cap, agents fall back to their free models. */
  openRouterDailyUsd: Number(process.env.OPENROUTER_DAILY_USD || '5'),
  oddsApiKey: process.env.ODDS_API_KEY || '',
  limits: {
    aiDailyCalls: num('AI_DAILY_CALL_LIMIT', 8000),
    aiDailyTokens: num('AI_DAILY_TOKEN_LIMIT', 20_000_000),
    sportsDailyRequests: num('SPORTS_API_DAILY_LIMIT', 6000),
    maxConcurrentJobs: num('MAX_CONCURRENT_ANALYSES', 2),
    maxFixturesDaily: num('MAX_FIXTURES_PER_JOB', 30),
    maxFixturesWeekly: num('MAX_FIXTURES_WEEKLY_JOB', 48),
    batchSize: num("ANALYSIS_BATCH_SIZE", 4),
    /** A fixture enters the analysis only with at least this many real, allowed (non-„sub”) priced selections. */
    minMarkets: num('MIN_MARKETS_PER_FIXTURE', 30),
    debateRounds: Math.min(2, num('DEBATE_ROUNDS', 1)),
    maxOutputTokens: num('AI_MAX_OUTPUT_TOKENS', 2200),
    consensusThreshold: num('CONSENSUS_THRESHOLD', 3),
    oddsMaxAgeMinutes: num('ODDS_MAX_AGE_MINUTES', 180),
    targetTolerance: num('TARGET_TOLERANCE', 0.15),
  },
  /** DEMO data is only allowed in test runs. Production never substitutes synthetic data. */
  allowDemoProviders: process.env.BETMIND_TEST_MODE === '1',
};

export const isProduction = process.env.NODE_ENV === 'production';
