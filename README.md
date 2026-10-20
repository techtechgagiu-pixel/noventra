# BETMIND SIX · NEXUS 5.0

**Six Minds. One Decision.** — analiză de fotbal cu șase agenți AI, pe date reale, cu replay complet al deciziilor.

- Producție (nouă): https://nexus.noventra.ro · Render Free (Frankfurt) · Neon PostgreSQL Free (Frankfurt)
- Versiunea veche rămâne neatinsă pe https://betmindsix.noventra.ro (Cloudflare Worker `betmind-six`) — rezervă / rollback.
- UI în română, cod și documentație tehnică în engleză. Fus orar: Europe/Bucharest.

## What it does

Five generation slots per user, locked server-side by a unique `(user, slot, period)` constraint:

| Slot | Target | Period | Legs |
|---|---|---|---|
| `FIVE_A`, `FIVE_B` | 5 | Romanian calendar day | AUTO (2–5) |
| `TEN_A`, `TEN_B` | 10 | Romanian calendar day | AUTO (2–7) |
| `WEEKLY_100` | 100 | ISO week (Mon 00:00 Bucharest) | exactly 12 distinct fixtures |

AI runs **only** after `POST /api/ticket-slots/:slot/generate` (the CREEAZĂ BILETUL button). Page loads, ticket views,
replay, fixture sync and settlement never call a model (covered by tests).

Pipeline per job (checkpointed, idempotent units, `src/lib/jobs/pipeline.ts`):

1. **Discovery** — TOP 10 fixtures in the window, eligibility filters (pre-match, ≥20 min to kickoff, verified 1X2 odds),
   server-side seed → deterministic shuffle (`seededShuffle`) → persisted candidate order and batches.
2. **SCOUT** — up to 10 past league matches per team (ESPN season schedule + match summaries, cached in
   `historical_match_statistics`), strictly before kickoff. Deterministic dossier: record, goals, shots on target,
   finishing delta, results-vs-underlying-performance verdict, anomalies classified as `VERIFIED EVENT` /
   `POSSIBLE FORTUITOUS INFLUENCE` / `INSUFFICIENT EVIDENCE`. Optional short LLM summary. **No video** (none licensed); the UI says so.
3. **Statistical engine** (`src/lib/stats/engine.ts`) — Poisson with shrinkage toward league averages, blending goals with
   shots on target, de-margined market probabilities, blended estimate, EV = p × odds − 1. LLMs never compute numbers.
4. **Six independent agents** — same factual snapshot, strict JSON schemas (Zod), no access to each other's first answer.
5. **Debate** — up to 2 rounds, only for contested fixtures (round 2 only when one vote short).
6. **Vote + validation** — one vote per agent, ≥4/6 on the same canonical market. Votes are normalised by logical
   implication on the score grid (a vote for "Away wins" also supports "Draw or Away"); the most specific market reaching 4/6
   is chosen and direct vs. implied supporters are recorded. Then freshness/odds/kickoff/probability/EV/data checks.
   Consensus never overrides validation.
7. **Optimizer** (`src/lib/optimizer.ts`) — bounded beam search in log-odds space, ±15% tolerance, never alters prices,
   flags mixed bookmakers; weekly requires exactly 12 distinct fixtures or returns an honest INCOMPLETE.

Every meaningful transition is an `analysis_events` row (gap-free per-job `seq`). The same client reducer
(`src/lib/nexus-state.ts`) drives LIVE (SSE + polling fallback) and **Decision Replay** (read-only, zero inference).

## Agents and models (verified in the provider catalogs on 2026-10-19)

| Agent | Role | Risk | Model | Fallback |
|---|---|---|---|---|
| Victor | Strategul | 20 | groq `openai/gpt-oss-20b` | groq `qwen/qwen3.8-27b` |
| Andrei | Matematicianul | 60 | groq `openai/gpt-oss-120b` | groq `openai/gpt-oss-20b` |
| Mihai | Veteranul | 40 | gemini `gemini-3.6-flash` | gemini `gemini-3.1-flash-lite` |
| Alex | Vânătorul de cote | 90 | groq `qwen/qwen3.8-27b` | groq `openai/gpt-oss-20b` |
| Diana | Tacticiana | 50 | gemini `gemini-3.5-flash-lite` | gemini `gemini-3.1-flash-lite` |
| Robert | Managerul de risc | 10 | groq `openai/gpt-oss-120b` | groq `qwen/qwen3.8-27b` |
| SCOUT | Cercetare (nu votează) | — | groq `openai/gpt-oss-20b` | groq `qwen/qwen3.8-27b` |

Substitutions vs. the original brief: Qwen 3 32B and Llama models are no longer in this Groq account's catalog
(Qwen 3.8 27B is); Gemini 2.5 Flash is closed to new users, Gemini 3.5/3.6 Flash replace it. Assignments are versioned
in `agent_model_assignments` and editable in **/admin/models**; every prediction stores the model actually used.
Six models ≠ six statistically independent opinions.

## Data sources

- **ESPN public site API** — fixtures, status, standings, team schedules, match summaries and embedded bookmaker odds
  (DraftKings) for 9/10 leagues. No SLA, no contractual licence; `providerUpdatedAt` is unknown → stored as `null`,
  `observedAt` is our read time. Suitable for a personal tool; review licensing before any commercial launch.
- **LPF (lpf.ro)** — official Romanian SuperLiga schedule. ESPN's `rou.1` feed is stale (last events 2025-09).
  LPF publishes no odds, so Romanian fixtures are shown but never qualify.
- Optional `ODDS_API_KEY` (The Odds API) placeholder; not wired into default selection.

## Local development

```sh
npm install
# Postgres 16 locally, then:
DATABASE_URL=postgresql://postgres@localhost:5432/betmind npm run migrate
npm run build && npm start            # migrations run automatically on start
npm test                              # unit + integration (needs TEST_DATABASE_URL or local :5433)
PW_CHROMIUM=/path/to/chromium npm run test:e2e   # Playwright, DEMO fixtures + fake AI transport
```

Test mode (`BETMIND_TEST_MODE=1` + localhost base URL) enables `/auth/test-login` and `/api/test/stats`; both 404 otherwise.
`BETMIND_E2E_FAKES=1` installs clearly labelled DEMO fixtures and a deterministic fake AI transport for e2e only.

See `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md` (backup, rollback, quotas).

18+ · Analizele nu garantează rezultatele. Aplicația nu plasează pariuri.
