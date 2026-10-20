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
export type LegPolicy = { minOdds: number; maxOdds: number; minProbability: number; minLegs: number; maxLegs: number };
export const POLICIES = {
  five: { minOdds: 1.15, maxOdds: 1.65, minProbability: 0.6, minLegs: 3, maxLegs: 7 },
  two: { minOdds: 1.12, maxOdds: 1.45, minProbability: 0.68, minLegs: 2, maxLegs: 4 },
  weekly: { minOdds: 1.2, maxOdds: 1.85, minProbability: 0.55, minLegs: 12, maxLegs: 12 },
} satisfies Record<string, LegPolicy>;

export const SLOTS: readonly SlotDefinition[] = [
  { id: 'FIVE_A', title: 'COTĂ 5 — BILETUL A', subtitle: 'Bilet zilnic · minimum 3 meciuri, cote 1.15–1.65', target: 5, period: 'daily', requiredLegs: null, variant: 'A', windowDays: 5, policy: POLICIES.five },
  { id: 'FIVE_B', title: 'COTĂ 5 — BILETUL B', subtitle: 'Bilet zilnic · minimum 3 meciuri, cote 1.15–1.65', target: 5, period: 'daily', requiredLegs: null, variant: 'B', windowDays: 5, policy: POLICIES.five },
  { id: 'TWO_A', title: 'COTĂ 2 — BILETUL A', subtitle: 'Bilet zilnic · cote mici 1.12–1.45', target: 2, period: 'daily', requiredLegs: null, variant: 'A', windowDays: 5, policy: POLICIES.two },
  { id: 'TWO_B', title: 'COTĂ 2 — BILETUL B', subtitle: 'Bilet zilnic · cote mici 1.12–1.45', target: 2, period: 'daily', requiredLegs: null, variant: 'B', windowDays: 5, policy: POLICIES.two },
  { id: 'WEEKLY_100', title: 'BILETUL SĂPTĂMÂNII', subtitle: 'COTĂ 100 — 12 MECIURI', target: 100, period: 'weekly', requiredLegs: 12, variant: 'W', windowDays: 7, policy: POLICIES.weekly },
] as const;

export function slotById(id: string): SlotDefinition | undefined {
  return SLOTS.find((s) => s.id === id);
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

/** Fixture window: daily = today + 4 days; weekly = 7 days from the actual creation date. */
export function fixtureWindow(slot: SlotDefinition, at: Date = new Date()) {
  const start = localDate(at);
  return { startDate: start, endDateExclusive: addDays(start, slot.windowDays), days: slot.windowDays };
}

/** When the slot becomes available again (local midnight next day / next Monday). */
export function nextReset(slot: SlotDefinition, at: Date = new Date()): string {
  return slot.period === 'daily' ? addDays(localDate(at), 1) : addDays(isoWeekStart(at), 7);
}
