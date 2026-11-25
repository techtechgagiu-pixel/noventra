/**
 * „Șansa reală” (18.11): how often the legs TREI PUNCTE puts on tickets actually win, by price band, measured on every
 * settled selection. On 18.11 (1 737 legs) the agents won slightly less often than the bookmaker's price implies in
 * every band (85% vs 87% under 1.20, 55% vs 63% at 1.50–1.80), so a 10-leg ticket at 1.25 each is far less likely
 * than its price suggests. The form and the ticket show that number instead of letting the price speak for itself.
 */
export type CalibrationBand = { lo: number; hi: number; n: number; won: number; implied: number };

/** Price bands used for the measurement (upper bound exclusive). */
export const BANDS: Array<[number, number]> = [[1, 1.2], [1.2, 1.35], [1.35, 1.5], [1.5, 1.8], [1.8, 100]];
/** Without enough history a band falls back to the price with a typical 5% bookmaker margin. */
const PRIOR_RATIO = 0.95, PRIOR_WEIGHT = 40;

/** Measured ratio „wins ÷ price-implied wins” for a price, shrunk toward the prior when a band has few legs. */
export function ratioFor(odds: number, bands: CalibrationBand[]) {
  const b = bands.find((x) => odds >= x.lo && odds < x.hi);
  if (!b || !b.n || !(b.implied > 0)) return PRIOR_RATIO;
  const measured = b.won / (b.n * b.implied);
  return (b.n * measured + PRIOR_WEIGHT * PRIOR_RATIO) / (b.n + PRIOR_WEIGHT);
}

/** Estimated chance that one leg at this price wins. */
export function legChance(odds: number, bands: CalibrationBand[]) {
  if (!(odds > 1)) return 0;
  return Math.min(0.99, ratioFor(odds, bands) / odds);
}

/** Estimated chance that the whole ticket wins (legs treated as independent). */
export function ticketChance(prices: number[], bands: CalibrationBand[]) {
  return prices.length ? prices.reduce((p, o) => p * legChance(o, bands), 1) : 0;
}

/** For a target price, the number of legs (1…maxLegs) that gives the best estimated chance, keeping 1.10–3.20 a leg. */
export function bestLegs(target: number, bands: CalibrationBand[], maxLegs = 20) {
  let best: { legs: number; chance: number; perLeg: number } | null = null;
  for (let legs = 1; legs <= maxLegs; legs++) {
    const perLeg = Math.pow(target, 1 / legs);
    if (perLeg < 1.1 || perLeg > 3.2) continue;
    const chance = Math.pow(legChance(perLeg, bands), legs);
    if (!best || chance > best.chance + 1e-9) best = { legs, chance, perLeg };
  }
  return best;
}

/** „~4%”, „~0.3%”, „<0.1%”. */
export function pct(p: number) {
  if (!(p > 0)) return '—';
  const v = p * 100;
  return v < 0.1 ? '<0,1%' : `~${(v < 1 ? v.toFixed(1) : v < 10 ? v.toFixed(1) : Math.round(v).toString()).replace('.', ',')}%`;
}
