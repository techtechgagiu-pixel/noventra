/**
 * Bounded ticket optimizer: beam search in log-odds space. Never alters individual prices.
 * Daily slots: AUTO leg count (prefers fewer legs). Weekly slot: exactly `requiredLegs` distinct fixtures.
 */
export type Candidate = {
  fixtureId: string;
  teams: string[]; // both team names, to avoid the same team twice
  odds: number;
  bookmaker: string;
  quality: number; // 0..1 — consensus strength × data quality
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  probability?: number | null; // stats-engine probability that this leg wins
  family?: string; // market type (1X2, DC, TOTAL, TT, AH) — at most half of a ticket may share one
};

export type OptimizerResult = {
  status: 'COMPLETED' | 'INCOMPLETE';
  legs: Candidate[];
  totalOdds: number;
  withinTolerance: boolean;
  mixedBookmakers: boolean;
  reason: string;
  closest: { legs: Candidate[]; totalOdds: number } | null;
};

const BEAM = 200;

/**
 * Among combinations within tolerance of the target, the SAFEST one wins: highest estimated probability that
 * every leg wins (product of leg probabilities). `maxLegOdds` and `minLegs` keep tickets made of small prices.
 */
export function optimizeTicket(input: { candidates: Candidate[]; target: number; requiredLegs: number | null; tolerance: number; avoidFixtures?: Set<string>; maxLegs?: number; minLegs?: number; maxLegOdds?: number }): OptimizerResult {
  const goal = Math.log(input.target);
  const tol = Math.log(1 + input.tolerance);
  const unique = dedupe(input.candidates.filter((c) => !input.maxLegOdds || c.odds <= input.maxLegOdds + 1e-9));
  const maxLegs = input.requiredLegs ?? Math.min(input.maxLegs ?? (input.target <= 5 ? 5 : 7), unique.length);
  const minLegs = input.requiredLegs ?? Math.max(2, input.minLegs ?? 2);
  if (input.requiredLegs && unique.length < input.requiredLegs) {
    return { status: 'INCOMPLETE', legs: [], totalOdds: 0, withinTolerance: false, mixedBookmakers: false, closest: unique.length ? { legs: unique, totalOdds: product(unique) } : null, reason: `Sunt necesare exact ${input.requiredLegs} selecții calificate din meciuri distincte; au fost disponibile ${unique.length}.` };
  }
  if (unique.length < minLegs) {
    return { status: 'INCOMPLETE', legs: [], totalOdds: 0, withinTolerance: false, mixedBookmakers: false, closest: unique.length ? { legs: unique, totalOdds: product(unique) } : null, reason: `Prea puține selecții calificate cu cote mici (${unique.length}); biletul cere minimum ${minLegs} meciuri.` };
  }
  // Order: higher quality first so the beam keeps strong legs.
  const items = [...unique].sort((a, b) => b.quality - a.quality || a.odds - b.odds);
  type State = { idx: number[]; log: number; quality: number; teams: Set<string> };
  let layers: State[][] = Array.from({ length: maxLegs + 1 }, () => []);
  layers[0] = [{ idx: [], log: 0, quality: 0, teams: new Set() }];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const next = layers.map((l) => [...l]);
    for (let size = Math.min(maxLegs, i + 1); size >= 1; size--) {
      for (const s of layers[size - 1]) {
        if (it.teams.some((t) => s.teams.has(t))) continue;
        const log = s.log + Math.log(it.odds);
        if (log > goal + tol + 0.0001 && input.requiredLegs === null) continue; // overshoot: only grows further
        next[size].push({ idx: [...s.idx, i], log, quality: s.quality + it.quality, teams: new Set([...s.teams, ...it.teams]) });
      }
    }
    layers = next.map((l, size) => prune(l, size, goal, input.requiredLegs));
  }
  const allPool = input.requiredLegs ? layers[input.requiredLegs] : layers.slice(minLegs).flat();
  // Variety rule (user request 2026-10-21): with 3+ legs, no market type may fill more than half of the ticket.
  const varied = (s: { idx: number[] }) => {
    if (s.idx.length < 3) return true;
    const counts = new Map<string, number>();
    for (const i of s.idx) { const f = items[i].family ?? `fixture:${items[i].fixtureId}`; counts.set(f, (counts.get(f) ?? 0) + 1); }
    return Math.max(...counts.values()) <= Math.ceil(s.idx.length / 2);
  };
  const pool = allPool.filter(varied);
  if (!pool.length && allPool.length) return { status: 'INCOMPLETE', legs: [], totalOdds: 0, withinTolerance: false, mixedBookmakers: false, closest: null, reason: 'Selecțiile calificate sunt prea asemănătoare: niciun bilet nu respectă regula „maximum jumătate din meciuri pe același tip de pronostic”.' };
  if (!pool.length) return { status: 'INCOMPLETE', legs: [], totalOdds: 0, withinTolerance: false, mixedBookmakers: false, closest: null, reason: 'Nicio combinație validă din selecțiile calificate.' };
  const avoid = input.avoidFixtures ?? new Set();
  const score = (s: State) => {
    const dist = Math.abs(s.log - goal);
    const legs = s.idx.length;
    const overlap = s.idx.filter((i) => avoid.has(items[i].fixtureId)).length;
    const books = new Set(s.idx.map((i) => items[i].bookmaker)).size;
    const logWin = s.idx.reduce((sum, i) => sum + Math.log(legProbability(items[i])), 0); // ≤ 0; closer to 0 = safer
    return (dist <= tol ? 0 : 10 + dist * 10) - logWin - (s.quality / legs) * 0.1 + overlap * 0.15 + (books - 1) * 0.05;
  };
  const best = [...pool].sort((a, b) => score(a) - score(b))[0];
  const legs = best.idx.map((i) => items[i]);
  const total = product(legs);
  const within = Math.abs(Math.log(total) - goal) <= tol;
  const mixed = new Set(legs.map((l) => l.bookmaker)).size > 1;
  if (!within) {
    return { status: 'INCOMPLETE', legs: [], totalOdds: 0, withinTolerance: false, mixedBookmakers: mixed, closest: { legs, totalOdds: total }, reason: `Cea mai apropiată combinație are cota ${total.toFixed(2)}, în afara toleranței de ±${Math.round(input.tolerance * 100)}% față de ținta ${input.target}.` };
  }
  return { status: 'COMPLETED', legs, totalOdds: total, withinTolerance: true, mixedBookmakers: mixed, closest: null, reason: `Combinație de ${legs.length} selecții cu cota ${total.toFixed(2)} (țintă ${input.target}).` };
}

function prune<T extends { log: number; idx: number[]; quality: number }>(states: T[], size: number, goal: number, required: number | null) {
  if (states.length <= BEAM) return states;
  const expected = required ? (goal * size) / required : goal;
  // Keep a spread of log values (diversity) plus the closest to the expected trajectory.
  const sorted = [...states].sort((a, b) => Math.abs(a.log - expected) - Math.abs(b.log - expected) || b.quality - a.quality);
  const kept: T[] = [];
  const buckets = new Set<number>();
  for (const s of sorted) {
    const bucket = Math.round(s.log * 20);
    if (kept.length < BEAM / 2 || !buckets.has(bucket)) { kept.push(s); buckets.add(bucket); }
    if (kept.length >= BEAM) break;
  }
  return kept;
}

const legProbability = (c: Candidate) => Math.min(0.97, Math.max(0.05, c.probability ?? 0.95 / c.odds));

function dedupe(c: Candidate[]) {
  const best = new Map<string, Candidate>();
  for (const x of c) { const prev = best.get(x.fixtureId); if (!prev || x.quality > prev.quality) best.set(x.fixtureId, x); }
  return [...best.values()];
}
const product = (legs: Candidate[]) => Math.round(legs.reduce((p, l) => p * l.odds, 1) * 1000) / 1000;
