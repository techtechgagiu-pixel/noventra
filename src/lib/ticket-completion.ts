/** „Completează biletul” (06.11): a finished custom ticket that missed its target is re-analysed once with fewer agents required to agree. */
export const BOOST_AGREE = 4;
/** A custom ticket missed its target when its total is more than the tolerance below it (e.g. 1.82 for a 10). */
export const missedTarget = (actual: number | null | undefined, target: number, tolerance = 0.15) =>
  actual != null && Number.isFinite(actual) && Number.isFinite(target) && actual < target * (1 - tolerance);
/** Votes needed for the re-analysis: 4, and always at least one fewer than the team size, never below 2. */
export const boostedAgree = (agents: number, current?: number | null) => Math.max(2, Math.min(current ?? agents, BOOST_AGREE, agents - 1));
