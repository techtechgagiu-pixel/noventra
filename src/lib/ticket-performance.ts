/** Reporting only: totals are calculated from exactly the tickets shown by the archive filters. */
export type PerformanceTicket = {
  generation_status: string; outcome_status: string; actual_odds: number | null;
  selections: Array<{ outcome: string; odds: number; market_key?: string; model_probability?: number | null }>;
};
export function ticketPerformance(tickets: PerformanceTicket[]) {
  const complete = tickets.filter((t) => t.generation_status === 'COMPLETED');
  const count = (status: string) => complete.filter((t) => t.outcome_status === status).length;
  const markets = new Map<string, { market: string; n: number; won: number; lost: number; pending: number; voided: number; brier: number | null; samples: number; errors: number }>();
  for (const t of tickets) for (const s of t.selections) {
    const key = s.market_key?.split(':')[0] ?? 'Altele';
    const r = markets.get(key) ?? { market: key, n: 0, won: 0, lost: 0, pending: 0, voided: 0, brier: null, samples: 0, errors: 0 };
    r.n++; if (s.outcome === 'WON') r.won++; else if (s.outcome === 'LOST') r.lost++; else if (s.outcome === 'VOID') r.voided++; else r.pending++;
    if (['WON','LOST'].includes(s.outcome) && s.model_probability != null) { r.errors += (s.model_probability - (s.outcome === 'WON' ? 1 : 0)) ** 2; r.samples++; r.brier = r.errors / r.samples; }
    markets.set(key,r);
  }
  return { tickets: { total: tickets.length, completed: complete.length, incomplete: tickets.filter((t) => t.generation_status === 'INCOMPLETE').length, no_bet: tickets.filter((t) => t.generation_status === 'NO_BET').length,
    won: count('WON'), lost: count('LOST'), pending: count('PENDING'), void: count('VOID'), partial_void: count('PARTIAL_VOID'),
    units: complete.reduce((sum,t) => sum + (t.outcome_status === 'LOST' ? -1 : t.outcome_status === 'WON' ? (t.actual_odds ?? 1) - 1 : t.outcome_status === 'PARTIAL_VOID' ? t.selections.filter((s) => s.outcome !== 'VOID').reduce((n,s) => n * s.odds,1) - 1 : 0),0) },
    selections: [...markets.values()].sort((a,b) => b.n-a.n) };
}
