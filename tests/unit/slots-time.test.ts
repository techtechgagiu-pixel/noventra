import { describe, expect, it } from 'vitest';
import { SLOTS, fixtureWindow, nextReset, periodKey, slotById } from '@/lib/slots';
import { isoWeekStart, localDate, localMidnightUtc } from '@/lib/time';

describe('ticket slots', () => {
  it('exactly five slots: 2× cotă 5, 2× cotă 10, 1× weekly 100 with 12 legs', () => {
    expect(SLOTS).toHaveLength(5);
    expect(SLOTS.filter((s) => s.target === 5 && s.period === 'daily')).toHaveLength(2);
    expect(SLOTS.filter((s) => s.target === 10 && s.period === 'daily')).toHaveLength(2);
    const w = SLOTS.filter((s) => s.period === 'weekly');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ id: 'WEEKLY_100', target: 100, requiredLegs: 12 });
  });
  it('daily period follows Europe/Bucharest midnight, not UTC', () => {
    const slot = slotById('FIVE_A')!;
    // 21:30 UTC on 19 Oct = 00:30 on 20 Oct in Bucharest (UTC+3, summer time)
    expect(periodKey(slot, new Date('2026-10-19T21:30:00Z'))).toBe('2026-10-20');
    expect(periodKey(slot, new Date('2026-10-19T20:59:00Z'))).toBe('2026-10-19');
    // winter time (UTC+2): 22:30 UTC on 1 Dec = 00:30 on 2 Dec
    expect(periodKey(slot, new Date('2026-12-01T22:30:00Z'))).toBe('2026-12-02');
  });
  it('weekly period resets Monday 00:00 Bucharest', () => {
    const w = slotById('WEEKLY_100')!;
    expect(periodKey(w, new Date('2026-10-25T20:59:00Z'))).toBe('2026-10-19'); // Sun 23:59 local
    expect(periodKey(w, new Date('2026-10-25T22:01:00Z'))).toBe('2026-10-26'); // Mon 00:01 local (after DST change, UTC+2)
    expect(isoWeekStart(new Date('2026-10-21T10:00:00Z'))).toBe('2026-10-19');
    expect(nextReset(w, new Date('2026-10-21T10:00:00Z'))).toBe('2026-10-26');
  });
  it('fixture windows: daily today+4 days, weekly 7 days from creation', () => {
    const at = new Date('2026-10-22T08:00:00Z');
    expect(fixtureWindow(slotById('TEN_B')!, at)).toMatchObject({ startDate: '2026-10-22', endDateExclusive: '2026-10-27', days: 5 });
    expect(fixtureWindow(slotById('WEEKLY_100')!, at)).toMatchObject({ startDate: '2026-10-22', endDateExclusive: '2026-10-29', days: 7 });
  });
  it('local midnight conversion handles DST', () => {
    expect(localMidnightUtc('2026-10-20').toISOString()).toBe('2026-10-19T21:00:00.000Z');
    expect(localMidnightUtc('2026-12-02').toISOString()).toBe('2026-12-01T22:00:00.000Z');
    expect(localDate(new Date('2026-10-19T21:00:00Z'))).toBe('2026-10-20');
  });
});
