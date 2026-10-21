# Architecture

One Next.js 16 (App Router, Node runtime) service on Render Free + Neon PostgreSQL. No Redis, no queues, no workers.

```
browser ──HTTPS──> Next.js (Render)
                    ├─ route handlers /api/*  (Zod validation, session auth, same-origin CSRF check, rate limits)
                    ├─ in-process worker (src/lib/jobs/worker.ts) started from instrumentation.ts
                    │     claims jobs with UPDATE … FOR UPDATE SKIP LOCKED + 3-min lease
                    │     runs ≤50 s slices of checkpointed units, then re-queues
                    └─ settlement timer (15 min, deterministic, no AI)
                  Neon Postgres: users/sessions, jobs, events, predictions, decisions, tickets, caches, usage
external: ESPN (public), lpf.ro, Groq, Gemini, OpenRouter
```

## Job state machine

Access: `/login` accepts only invitation codes. A permanent admin-code hash lives in Render's
`OWNER_ACCESS_CODE_HASH`; rotating it invalidates admin sessions. Visitor codes are hashed in `invitation_codes`,
expire 168 hours after issue, and are checked for expiry/revocation on every request (including each SSE poll).
Each code has an internal user identity; no account registration or email is required. Legacy Google routes
redirect to `/login` and cannot create sessions. Existing owner tickets are preserved.

`QUEUED → RUNNING ⇄ WAITING (provider rate-limit, auto) → … → COMPLETED | INCOMPLETE | NO_BET`
`RUNNING → PAUSED` (daily quota / repeated errors) → user presses **CONTINUĂ ANALIZA** → `QUEUED` (same job, same seed, same order).
An expired lease on a `RUNNING` job (Render restart/sleep) is reclaimed and a `JOB_RESUMED` event records it honestly.

Checkpoint (`ticket_generation_jobs.checkpoint`): `phase` (DISCOVER/BATCH/BUILD/DONE), `batchIndex`, `batchStep`
(FETCH/SCOUT/STATS/INITIAL/DEBATE1/DEBATE2/VOTE), `agentsDone[]`, counters. Each agent call is one unit; after a crash at most
that one call is repeated. Unique constraints on `agent_predictions(job, fixture, agent, round)` and
`final_decisions(job, fixture)` keep writes idempotent.

## Render Free behaviour

Render Free sleeps after ~15 min without inbound HTTP. While a user watches NEXUS, SSE/polling keeps it awake. If the
browser is closed the service may sleep; the job simply stays persisted and resumes when the service wakes (any visit).
Nothing is processed while asleep and the UI never claims otherwise.

## Separation LIVE vs REPLAY

- LIVE `/nexus?job=…`: SSE `/api/jobs/:id/events` (persisted events; reconnect with `after=seq`), polling fallback.
- REPLAY `/tickets/:id/replay`: one read of stored events; client-side playback (play/pause/restart/prev/next/scrubber/1×-2×-4×,
  stage jumps). No inference, no sports API, no job creation (asserted in integration + e2e tests).

## Key modules

| Path | Purpose |
|---|---|
| `src/lib/slots.ts`, `src/lib/time.ts` | Slot definitions, Bucharest day / ISO-week periods, fixture windows |
| `src/lib/jobs/service.ts` | Create-or-get job (DB uniqueness), prerequisite checks before reserving, resume |
| `src/lib/jobs/pipeline.ts` | Discovery, SCOUT, stats, agents, debate, vote/validation, optimizer, finalization |
| `src/lib/jobs/events.ts` | Event log with gap-free sequence |
| `src/lib/ai/router.ts` | Provider-independent router (Groq, Gemini, OpenRouter), JSON validation + repair, explicit fallback, pacing from rate-limit headers, budgets, usage logs |
| `src/lib/ai/agents.ts` | Versioned agent instructions and output schemas |
| `src/lib/sports/*` | ESPN + LPF adapters, cached/counted HTTP, change-only persistence |
| `src/lib/scout/*` | Historical research + dossier |
| `src/lib/stats/engine.ts` | Deterministic probabilities |
| `src/lib/optimizer.ts` | Ticket combination |
| `src/lib/nexus-state.ts` | Event reducer shared by LIVE and REPLAY |

## Why not Prisma / Vercel AI SDK / React Flow / Recharts

- `pg` + plain SQL migrations: transactions, `ON CONFLICT`, `SKIP LOCKED` and advisory-lock migrations are first-class; no
  engine binary on a 512 MB free instance.
- Direct provider calls (~150 lines) instead of the AI SDK: Groq's `x-ratelimit-*` headers drive pacing, and Gemini 3
  thinking / JSON settings are set explicitly.
- NEXUS network is a hand-written SVG (lighter than React Flow; honours reduced motion). Charts were not needed for the
  current data volume; tables are used until there is enough settled history.
