# Operations: backup, rollback, quotas, costs

## Costs
Everything runs on free plans: Render Free web service, Neon Free, Groq Free, Gemini API free tier, ESPN public endpoints.
No paid workers, cron services, instance upgrades or paid AI fallbacks are configured. Expected cost: 0 USD/month.

## Quotas (observed 2026-10-19)
- Groq Free: ~8,000 tokens/minute and 1,000 requests/day **per model** (headers `x-ratelimit-*`). The router reads these headers
  and waits; a long wait puts the job in `WAITING` (auto-resume) instead of failing.
- Gemini free tier: per-model RPM/RPD limits; 503 "high demand" happens — one retry, then the configured Gemini fallback.
- App caps (env): `AI_DAILY_CALL_LIMIT` (900), `AI_DAILY_TOKEN_LIMIT` (1.5M), `SPORTS_API_DAILY_LIMIT` (6000),
  `MAX_CONCURRENT_ANALYSES` (2), `MAX_FIXTURES_PER_JOB` (18), `MAX_FIXTURES_WEEKLY_JOB` (36), `ANALYSIS_BATCH_SIZE` (3), `DEBATE_ROUNDS` (2).
- Typical daily job: 6–18 fixtures → 2–6 batches × (1 SCOUT + 6 agents + ≤12 debate) calls ≈ 20–80 calls, ~60–250k tokens.
  Weekly: up to 12 batches; may take 30–60 min because of free-tier pacing, and can need two sessions if a daily cap is hit.
- Neon Free: 0.5 GB storage. Events are compact JSON; no animation frames are stored. `/admin/usage` shows DB size.

## Backup / export
```sh
pg_dump "$DIRECT_DATABASE_URL" --no-owner --format=custom -f betmind-$(date +%F).dump
pg_restore --no-owner -d "$TARGET_URL" betmind-YYYY-MM-DD.dump
```
Neon also keeps point-in-time history on the free plan (limited window) — branch from a timestamp to recover.

## Rollback
- App: Render → Deploys → *Rollback* to a previous deploy (migrations are additive; never destructive).
- Domain: remove the `nexus` CNAME; the old system on `betmindsix.noventra.ro` keeps working independently.
- Data: restore a dump into a new Neon branch and point `DATABASE_URL` at it.

## Retention
Ticket evidence (events, predictions, dossiers, decisions, snapshots) is permanent. `sessions` are purged when expired.
`model_usage_logs` and `provider_usage` can be trimmed after 90 days without affecting tickets.
