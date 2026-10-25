# Custom batches and archive display — 25 October 2026

User-facing changes:
- After interval/leagues and agents, choose how many demo tickets to generate with the same target, exact match count, interval, leagues and team.
- Daily Custom allowance is now **20 per user, per Europe/Bucharest calendar day**. Show remaining slots, reject oversized batches in full. Existing AI budgets and worker concurrency remain unchanged.
- Each ticket has a separate job, seed, event journal and result. Repeated matches/selections remain possible; no guarantee of distinct tickets or a completed ticket at the target.
- Live analysis includes links to every ticket in its batch and updates sibling statuses every five seconds until all are terminal. Paused jobs retain the existing resume action.
- “Bilete create” and the shared “Azi” archive show only pending selections, green tickets, or tickets with exactly one currently red match. A second red match removes the ticket from this list even if other matches remain pending. All-void tickets, NO BET and empty incomplete analyses are hidden.
- Incomplete tickets with accepted selections remain eligible under the same rules, with an explicit “Incomplet” label; they are never converted into completed tickets.
- No historical rows are deleted. Ticket detail URLs, APIs and global agent statistics retain full history. Archive performance remains explicitly scoped to displayed tickets, so it is not the full-history success rate.

Implementation:
- `POST /api/custom-tickets` accepts optional numeric integer `count` (1–20, default 1) and UUID `requestId`. Backwards-compatible `jobId`/`created`, plus `jobIds`/`batchId`.
- A transaction and per-user advisory lock protect the full lot and allowance. Batch metadata is in `config.customBatch = { id, index, count }`; no schema migration.
- Retry the same `requestId` and normalized settings to obtain existing job IDs without consuming more slots, even after midnight. Reusing an ID with different settings returns 409.
- Browser maintains the same request ID after a failed request while the settings remain the same, and blocks concurrent clicks. Page reload/new configuration is a new request.
- `GET /api/custom-tickets?batch=<uuid>` returns only the authenticated user's siblings. Shared watchers can still read individual analyses but don't receive another user's batch navigation metadata.
- Admission guard uses the existing 20-call minimum per ticket, scaled by quantity. It is not a quota reservation or cost estimate: actual AI calls still enforce the existing global daily limits, and jobs can pause at those limits.
- Archive categories derive from saved selection outcomes (or recovered accepted picks for incomplete tickets), not AI text.
- The additional informational The Odds API catalogue remains isolated from Custom/agents.

Validation:
- Full Vitest unit/integration suite passes; production build passes.
- CUA browser check with local fake providers and disabled worker: quantity 3 queues exactly 3 jobs, navigates among them, updates a sibling's terminal status, and reduces remaining allowance.
- Five synthetic archive cases: pending, won, one loss, two losses, all void. Exactly the first three are shown; green and one-loss filters each show one card.
- Existing onboarding/incomplete archive E2E specs updated for the new placement/filter; automated Playwright suite not run (browser verification used CUA).
