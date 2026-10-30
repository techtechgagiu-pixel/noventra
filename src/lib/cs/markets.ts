import type { MarketQuote } from '../sports/types';

/**
 * Counter-Strike markets, settled from the series score in maps (e.g. 2–1):
 * - ML:HOME|AWAY        match winner (no draw in BO1/BO3/BO5)
 * - MH:HOME|AWAY:line   map handicap on x.5 lines (MH:HOME:-1.5 = wins 2–0 in a BO3; MH:AWAY:+1.5 = wins at least one map)
 * - MT:OVER|UNDER:line  total maps on x.5 lines (MT:OVER:2.5 = the BO3 goes to a third map)
 */
export const CS_FAMILIES = new Set(['ML', 'MH', 'MT']);
export const isCsKey = (key: string) => CS_FAMILIES.has(key.split(':')[0]);
const fmt = (n: number) => `${n > 0 ? '+' : ''}${n}`;

export function csLabel(key: string, home: string, away: string): string {
  const [f, a, b] = key.split(':');
  if (f === 'ML') return `${a === 'HOME' ? home : away} câștigă meciul`;
  if (f === 'MH') return `${a === 'HOME' ? home : away} handicap ${fmt(Number(b))} hărți`;
  if (f === 'MT') return `${a === 'OVER' ? 'Peste' : 'Sub'} ${b} hărți`;
  return key;
}

export function csQuote(key: string, odds: number, home: string, away: string, bookmaker?: string): MarketQuote {
  const [f, , b] = key.split(':');
  const line = f === 'ML' ? undefined : Number(b);
  return { key, label: csLabel(key, home, away), marketType: f === 'ML' ? 'MONEYLINE' : f === 'MH' ? 'HANDICAP' : 'TOTAL', odds, ...(line === undefined ? {} : { line }), ...(bookmaker ? { bookmaker } : {}) };
}

/** Whether a CS selection wins for a final series score in maps (null = not a CS key). */
export function csSelectionWins(key: string, home: number, away: number): boolean | null {
  const [f, side, raw] = key.split(':');
  const line = Number(raw);
  switch (f) {
    case 'ML': return side === 'HOME' ? home > away : away > home;
    case 'MH': return side === 'HOME' ? home + line > away : away + line > home;
    case 'MT': return side === 'OVER' ? home + away > line : home + away < line;
    default: return null;
  }
}

/** Swaps HOME/AWAY in a key (a source that lists the teams in the other order). */
export const swapSide = (key: string) => key.replace(/:HOME(?=:|$)/, ':__A').replace(/:AWAY(?=:|$)/, ':HOME').replace(':__A', ':AWAY');
