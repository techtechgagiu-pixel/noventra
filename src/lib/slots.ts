import { addDays, isoWeekStart, localDate } from './time';

export type SlotId = 'FIVE_A' | 'FIVE_B' | 'TWO_A' | 'TWO_B' | 'WEEKLY_100';

export type SlotDefinition = {
  id: SlotId;
  title: string;
  subtitle: string;
  target: number;
  period: 'daily' | 'weekly';
  requiredLegs: number | null; // null = AUTO
  variant: 'A' | 'B' | 'W';
  windowDays: number;
  policy: LegPolicy;
};

/**
 * Prudence rules per ticket type. They are deterministic and applied in code, not left to the models:
 * - agents only see prices inside [minOdds, maxOdds];
 * - a selection needs the stats engine's probability ≥ minProbability;
 * - the ticket must reach the target with at least minLegs small-priced selections (never 2 big prices).
 */
export type LegPolicy = {
  minOdds: number; maxOdds: number; minProbability: number; minLegs: number; maxLegs: number;
  /** Added to every agent's own max price (weekly needs bigger legs). */
  agentCapBonus?: number;
  /** Daily tickets: kickoff must be at least minLeadHours and at most maxAheadHours from the moment of creation. */
  minLeadHours?: number;
  maxAheadHours?: number;
  /** Which qualified selection wins a fixture: the one most agents back ('safest') or the highest price still ≥ threshold ('highest'). */
  pick?: 'safest' | 'highest';
};
export const POLICIES = {
  five: { minOdds: 1.15, maxOdds: 1.65, minProbability: 0.6, minLegs: 3, maxLegs: 7, minLeadHours: 2, maxAheadHours: 48 },
  two: { minOdds: 1.12, maxOdds: 1.45, minProbability: 0.68, minLegs: 2, maxLegs: 4, minLeadHours: 2, maxAheadHours: 48 },
  // 12 legs × ~1.47 average ≈ 100: small prices alone cannot reach it, so the weekly band starts at 1.35 and allows up to 2.00.
  weekly: { minOdds: 1.35, maxOdds: 2.0, minProbability: 0.5, minLegs: 12, maxLegs: 12, agentCapBonus: 0.3, pick: 'highest' },
} satisfies Record<string, LegPolicy>;

export const SLOTS: readonly SlotDefinition[] = [
  { id: 'FIVE_A', title: 'COTĂ 5 — BILETUL A', subtitle: 'Meciuri peste 2–48 de ore · minimum 3 meciuri, cote 1.15–1.65', target: 5, period: 'daily', requiredLegs: null, variant: 'A', windowDays: 3, policy: POLICIES.five },
  { id: 'FIVE_B', title: 'COTĂ 5 — BILETUL B', subtitle: 'Meciuri peste 2–48 de ore · minimum 3 meciuri, cote 1.15–1.65', target: 5, period: 'daily', requiredLegs: null, variant: 'B', windowDays: 3, policy: POLICIES.five },
  { id: 'TWO_A', title: 'COTĂ 2 — BILETUL A', subtitle: 'Meciuri peste 2–48 de ore · cote mici 1.12–1.45', target: 2, period: 'daily', requiredLegs: null, variant: 'A', windowDays: 3, policy: POLICIES.two },
  { id: 'TWO_B', title: 'COTĂ 2 — BILETUL B', subtitle: 'Meciuri peste 2–48 de ore · cote mici 1.12–1.45', target: 2, period: 'daily', requiredLegs: null, variant: 'B', windowDays: 3, policy: POLICIES.two },
  { id: 'WEEKLY_100', title: 'BILETUL SĂPTĂMÂNII', subtitle: 'COTĂ 100 — 12 MECIURI · cote 1.35–2.00', target: 100, period: 'weekly', requiredLegs: 12, variant: 'W', windowDays: 7, policy: POLICIES.weekly },
] as const;

export function slotById(id: string): SlotDefinition | undefined {
  return SLOTS.find((s) => s.id === id);
}

/** Custom ticket chosen by the user: exact number of legs, a target price, a subset of agents and a time window. */
export type CustomConfig = { target: number; legs: number; agents: string[]; window: '24h' | '48h' | '7d';
  /** Exact interval chosen by the user: matches starting between fromHours and toHours from the moment of creation. */
  fromHours?: number; toHours?: number;
  /** League ids the user ticked; absent = every league. */
  leagues?: string[] };
export const CUSTOM_LIMIT_PER_DAY = 12;
/** Votes a selection needs from a team of n agents: 1 (≤3), 2 (4–6), then ~27% (3 of 12, 6 of 22). */
export const customThreshold = (n: number) => (n <= 3 ? 1 : n <= 6 ? 2 : Math.max(3, Math.round(n * 0.27)));
export const isCustomSlot = (id: string) => /^CUSTOM_\d+$/.test(id);

/** A ticket the user built himself and brought to the agents for review. */
export type ReviewLeg = { fixtureId: string; marketKey: string; label: string; odds: number; match: string; league: string; kickoff: string };
export type ReviewConfig = { legs: ReviewLeg[]; advice: string | null };
export const REVIEW_LIMIT_PER_DAY = 10;
export const isReviewSlot = (id: string) => /^REVIEW_\d+$/.test(id);
/** Review jobs judge the user's own picks: wide price band, no probability floor, exactly the user's legs. */
export function reviewPolicy(r: ReviewConfig): LegPolicy {
  return { minOdds: 1.01, maxOdds: 50, minProbability: 0, minLegs: r.legs.length, maxLegs: r.legs.length, agentCapBonus: 0, pick: 'safest' };
}

/** Price band and probability floor derived from the price each leg needs (target^(1/legs)). */
export function customPolicy(c: CustomConfig): LegPolicy {
  const perLeg = Math.pow(c.target, 1 / c.legs);
  const minOdds = Math.max(1.1, Math.round(perLeg * 0.72 * 100) / 100);
  const maxOdds = Math.min(4, Math.round((perLeg * 1.4 + 0.05) * 100) / 100);
  const minProbability = Math.min(0.75, Math.max(0.3, Math.round((0.95 / perLeg - 0.1) * 100) / 100));
  return {
    minOdds, maxOdds, minProbability, minLegs: c.legs, maxLegs: c.legs,
    agentCapBonus: Math.max(0, Math.round((perLeg - 1.4) * 100) / 100), pick: perLeg >= 1.45 ? 'highest' : 'safest',
    minLeadHours: c.fromHours ?? 2, maxAheadHours: c.toHours ?? (c.window === '24h' ? 24 : c.window === '48h' ? 48 : 168),
  };
}

/** Display info for any slot id, including custom and retired (COTĂ 10) ones. */
export function slotInfo(id: string, target: number, legs?: number | null): { id: string; title: string; subtitle: string } {
  const slot = slotById(id);
  if (slot) return { id: slot.id, title: slot.title, subtitle: slot.subtitle };
  if (isReviewSlot(id)) return { id, title: `BILETUL TĂU — COTĂ ${target}`, subtitle: `Adus la analiză${legs ? ` · ${legs} meciuri` : ''}` };
  if (isCustomSlot(id)) return { id, title: `CUSTOM — COTĂ ${target}`, subtitle: `Bilet personalizat${legs ? ` · ${legs} meciuri` : ''}` };
  if (id === 'TEN_A' || id === 'TEN_B') return { id, title: `COTĂ 10 — BILETUL ${id.slice(-1)} (vechi)`, subtitle: 'Bilet zilnic (format retras)' };
  return { id, title: id, subtitle: '' };
}

/** Policy for any slot id, including retired ones (COTĂ 10) still present in history. */
export function policyFor(slotId: string, target?: number): LegPolicy {
  const slot = slotById(slotId);
  if (slot) return slot.policy;
  if (target && target >= 50) return POLICIES.weekly;
  return { minOdds: 1.12, maxOdds: 2.6, minProbability: 0.45, minLegs: 2, maxLegs: 7 }; // legacy COTĂ 10
}

/** The period key that locks a slot: local date for daily slots, ISO week Monday for the weekly slot. */
export function periodKey(slot: SlotDefinition, at: Date = new Date()): string {
  return slot.period === 'daily' ? localDate(at) : isoWeekStart(at);
}

/** Fixture window: daily = today + tomorrow (Romanian calendar days); weekly = 7 days from the actual creation date. */
export function fixtureWindow(slot: SlotDefinition, at: Date = new Date()) {
  const start = localDate(at);
  return { startDate: start, endDateExclusive: addDays(start, slot.windowDays), days: slot.windowDays };
}

/** When the slot becomes available again (local midnight next day / next Monday). */
export function nextReset(slot: SlotDefinition, at: Date = new Date()): string {
  return slot.period === 'daily' ? addDays(localDate(at), 1) : addDays(isoWeekStart(at), 7);
}
