type RankedAgent = { won: number; lost: number; hitRate: number | null; bets: number };

/** The same ordering everywhere: decided results first, then hit rate and total picks. Stable ties preserve the roster order. */
export function rankAgents<T extends RankedAgent>(agents: readonly T[]): T[] {
  return [...agents].sort((a, b) => (b.won + b.lost ? 1 : 0) - (a.won + a.lost ? 1 : 0) || (b.hitRate ?? -1) - (a.hitRate ?? -1) || b.bets - a.bets);
}

/** Editorial roles and agents without decided results cannot form a historical Top 6. */
export function topSixAgentIds<T extends RankedAgent & { id: string; editorial: boolean }>(agents: readonly T[]): string[] {
  return rankAgents(agents).filter((a) => !a.editorial && a.won + a.lost > 0).slice(0, 6).map((a) => a.id);
}
