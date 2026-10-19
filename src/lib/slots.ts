import { addDays, isoWeekStart, localDate } from './time';

export type SlotId = 'FIVE_A' | 'FIVE_B' | 'TEN_A' | 'TEN_B' | 'WEEKLY_100';

export type SlotDefinition = {
  id: SlotId;
  title: string;
  subtitle: string;
  target: number;
  period: 'daily' | 'weekly';
  requiredLegs: number | null; // null = AUTO
  variant: 'A' | 'B' | 'W';
  windowDays: number;
};

export const SLOTS: readonly SlotDefinition[] = [
  { id: 'FIVE_A', title: 'COTĂ 5 — BILETUL A', subtitle: 'Bilet zilnic', target: 5, period: 'daily', requiredLegs: null, variant: 'A', windowDays: 5 },
  { id: 'FIVE_B', title: 'COTĂ 5 — BILETUL B', subtitle: 'Bilet zilnic', target: 5, period: 'daily', requiredLegs: null, variant: 'B', windowDays: 5 },
  { id: 'TEN_A', title: 'COTĂ 10 — BILETUL A', subtitle: 'Bilet zilnic', target: 10, period: 'daily', requiredLegs: null, variant: 'A', windowDays: 5 },
  { id: 'TEN_B', title: 'COTĂ 10 — BILETUL B', subtitle: 'Bilet zilnic', target: 10, period: 'daily', requiredLegs: null, variant: 'B', windowDays: 5 },
  { id: 'WEEKLY_100', title: 'BILETUL SĂPTĂMÂNII', subtitle: 'COTĂ 100 — 12 MECIURI', target: 100, period: 'weekly', requiredLegs: 12, variant: 'W', windowDays: 7 },
] as const;

export function slotById(id: string): SlotDefinition | undefined {
  return SLOTS.find((s) => s.id === id);
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
