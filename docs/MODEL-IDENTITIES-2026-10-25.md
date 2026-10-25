# Model identities throughout Primul11

The app now presents model names and AI portraits throughout public/signed-in home, Custom selection, live maps/chat, replays, ticket advice, agent statistics and administration. The ten additional models from the AI-team change are included: 32 voting roles and two editorial roles. The old character/model switch in Statistics is removed; legacy `vedere` URLs render the same model cards.

`model-identities.ts` provides friendly model names, companies, stable role names and portrait locations. Stored agent IDs remain unchanged. Statistics and server-produced agent lists use the active assignment; statistics can still include historical fallback runs. Roles sharing a model retain separate records and portraits. Public presentation uses the configured model catalogue and makes no inference calls.

All portraits are existing illustrative AI portraits, including the ten previously generated additions. Cards retain their result counters, XP, levels and Diamond thresholds. Risk limits and specialty remain available in Details; map labels fit the available space, with the full identity in the hover card.

Prompt version `v5.3-model-identities` replaces person-based self-identification with AI roles while preserving methods, voting rules, risk/odds limits, temperatures, primary/fallback models and budgets. Generated archived prose is normalized at read time through legacy aliases; database history, identifiers, market keys, teams and sourced headline fields are retained. Ambiguous single-name prefixes followed by a capitalized surname/team suffix are preserved. Migration `018_model_identities.sql` updates only `agents.name/title`; migration017 registers the ten new IDs before their assignments/predictions.

Validation: 184 unit/integration checks; application build/typecheck; 18 passing browser scenarios for all34 model cards, ten-model preset, legacy identity URLs, mobile sizing, career persistence and result-driven progression. Inference in automated tests uses simulated providers, never live model calls. Older E2E archive expectations are aligned with the already-existing rule that hides empty/NO_BET and multiple-loss tickets; no archive product rule changed here.

A browser check also reproduced premature chat closure when terminal metadata arrived before unread event pages. The client now drains through lastSeq; PostgreSQL stores the final event in the same transaction as final job/ticket state. A dedicated two-page SSE regression verifies no messages are discarded.

This release targets the existing Render/PostgreSQL deployment. It does not deploy the Cloudflare migration branch, change DNS or switch database backends. The separately saved Neon snapshot and partial D1 import remain a historical point-in-time migration rehearsal; a final source snapshot/reconciliation is still required before cutover.
