/** Display rules only: never delete tickets or change their canonical results/statistics. */
export type ArchiveResult = 'PENDING' | 'WON' | 'ONE_LOSS';
type OutcomePick = { outcome: string };
type ArchiveTicket = { generation_status: string; selections: OutcomePick[]; partialSelections?: OutcomePick[] };

export function archiveResult(ticket: ArchiveTicket): ArchiveResult | null {
  if (ticket.generation_status === 'NO_BET') return null;
  const picks = ticket.selections.length ? ticket.selections : ticket.generation_status === 'INCOMPLETE' ? ticket.partialSelections ?? [] : [];
  if (!picks.length) return null;
  const lost = picks.filter((s) => s.outcome === 'LOST').length;
  if (lost > 1) return null;
  if (lost === 1) return 'ONE_LOSS';
  if (picks.some((s) => s.outcome === 'PENDING')) return 'PENDING';
  if (picks.every((s) => ['WON', 'VOID'].includes(s.outcome)) && picks.some((s) => s.outcome === 'WON')) return 'WON';
  return null; // all void, empty, or unknown outcomes aren't green tickets
}
