# PRIMUL 11 (formerly BETMIND SIX · NEXUS 5.0)

> Since 2026-10-20: **single-owner app, no login.** Every request acts as the owner account (`OWNER_EMAIL`, default the first
> `ADMIN_EMAILS` entry); tickets from former Google accounts were merged into it. The UI is one page (`/`) with three tabs —
> `?tab=bilete` (slots, `&ticket=<id>`), `?tab=analiza` (live NEXUS `&job=<id>`, replay `&replay=<ticketId>`), `?tab=istoric`.
> Old routes (/dashboard, /tickets/…, /nexus, …) redirect there. Agents run in parallel within a batch (batch size 4).
>
> Rules added 2026-10-21: no „Under” selections at all (`isBannedMarket`); a ticket with 3+ legs may not have more than half
> of its legs on one market type. With `OPENROUTER_API_KEY` set, each voting agent runs on its own vendor's model
> (`src/lib/ai/openrouter-models.ts`, free Gemini/Groq model as fallback) under a daily cap `OPENROUTER_DAILY_USD` (default 1.5).
>
> Flow since 2026-10-21 (v4): a fixture enters only with ≥ `MIN_MARKETS_PER_FIXTURE` (30) real, allowed selections — DraftKings
> props now add BTTS, clean sheet, win by 2+, win both halves, half-time / second-half result, first-half goals and corners
> (settled from the score, the half-time score and the corner count read from the match summary). Each agent gives a main pick
> plus up to 2 alternatives; selections backed by ≥ 3 agents form the shortlist; the brain (Mircea Lucescu persona, stronger
> model) picks the ideal one per fixture (plus a backup if validation fails), weighing win chance, the ideal price per leg and
> ticket variety. One debate round by default.

**Six Minds. One Decision.** — analiză de fotbal cu șase agenți AI, pe date reale, cu replay complet al deciziilor.

- Producție (nouă): https://primul11.noventra.ro · Render Free (Frankfurt) · Neon PostgreSQL Free (Frankfurt)
- Versiunea veche rămâne neatinsă pe https://betmindsix.noventra.ro (Cloudflare Worker `betmind-six`) — rezervă / rollback.
- UI în română, cod și documentație tehnică în engleză. Fus orar: Europe/Bucharest.

## What it does

Five generation slots per user, locked server-side by a unique `(user, slot, period)` constraint:

| Slot | Target | Period | Legs |
|---|---|---|---|
| `FIVE_A`, `FIVE_B` | 5 | today + tomorrow (Romanian days) | AUTO 3–7, each leg 1.15–1.65, engine p ≥ 60% |
| `TWO_A`, `TWO_B` | 2 | today + tomorrow (Romanian days) | AUTO 2–4, each leg 1.12–1.45, engine p ≥ 68% |
| `WEEKLY_100` | 100 | ISO week (Mon 00:00 Bucharest) | exactly 12 distinct fixtures, each leg 1.35–2.00, p ≥ 50% |

(`TEN_A`/`TEN_B` — COTĂ 10 — were retired; old rows remain readable as history.)

### Prudence and agent character (deterministic, `src/lib/slots.ts`, `src/lib/jobs/analysis.ts`)
- Each agent has a code-enforced `maxOdds` / `minProbability` (Victor 1.55/68%, Robert 1.50/70% … Alex 2.50/45%). Agents only
  see prices inside `min(agent cap, ticket cap)`; a vote outside the agent's character or the ticket rules is recorded as
  `VOTE_SET_ASIDE` and not counted.
- Consensus: ≥ 3/10 supporters after logical normalisation; the key backed by the MOST agents wins (ties → lower price),
  so "Draw or Away" backed by 7 beats "Away" backed by 5. If Victor and Robert both refuse, 5/10 is required.
- Optimizer: among combinations within ±15% of the target, maximises the probability that every leg wins.
- Track record ("training" without fine-tuning): every agent pick is settled after the match (`agent_predictions.outcome`);
  each agent receives its own verified hit rate, odds buckets and calibration gap in later prompts (`src/lib/track-record.ts`).

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

## Agents and models (verified in the provider catalogs on 2026-10-20)

Ten voting agents + SCOUT. Selection threshold: **3/10** on the same canonical market (with logical vote normalisation).

| Agent | Role | Risk | Model | Fallback |
|---|---|---|---|---|
| Victor | Strategul | 20 | groq `openai/gpt-oss-20b` | gemini `gemini-3-flash-preview` |
| Andrei | Matematicianul | 60 | groq `openai/gpt-oss-120b` | gemini `gemini-3.6-flash` |
| Mihai | Veteranul | 40 | gemini `gemini-3.6-flash` | gemini `gemini-3.1-flash-lite` |
| Alex | Vânătorul de cote | 90 | groq `qwen/qwen3.8-27b` | gemini `gemini-3.1-flash-lite` |
| Diana | Tacticiana | 50 | gemini `gemini-3.5-flash-lite` | gemini `gemini-3.1-flash-lite` |
| Robert | Managerul de risc | 10 | groq `openai/gpt-oss-120b` | gemini `gemini-3-flash-preview` |
| Ioana | Specialista în goluri | 45 | gemini `gemini-3.1-flash-lite` | gemini `gemini-3.5-flash-lite` |
| Radu | Analistul acasă/deplasare | 30 | gemini `gemini-3.5-flash-lite` | gemini `gemini-3-flash-preview` |
| Elena | Statisticiana bayesiană | 35 | gemini `gemini-3-flash-preview` | gemini `gemini-3.6-flash` |
| Cosmin | Analistul de piață | 70 | gemini `gemini-3.1-flash-lite` | gemini `gemini-3-flash-preview` |
| SCOUT | Cercetare (nu votează) | — | gemini `gemini-3.1-flash-lite` | groq `openai/gpt-oss-20b` |

Groq Free allows **200,000 tokens per day per model** (rolling) and ~8,000 tokens/minute, so most agents run on Gemini.
Substitutions vs. the original brief are recorded as versioned assignments; every prediction stores the model actually used.

## Data sources

- **ESPN public site API** — fixtures, status, standings, team schedules, match summaries and embedded bookmaker odds
  (DraftKings) for 9/10 TOP leagues + 15 extended competitions (UEFA cups, second divisions, SCO/AUT/DEN/GRE/NOR/SWE).
  The ESPN core odds API adds Bet365 (1X2, double chance, .5 goal line) and DraftKings props (double chance,
  team totals; over/under accepted only when the price ladder proves the labels). BTTS is not used (unlabelled at source). No SLA, no contractual licence; `providerUpdatedAt` is unknown → stored as `null`,
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
