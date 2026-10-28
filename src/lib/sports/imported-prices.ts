import { config } from '../config';
import { atomic, many, one } from '../db';
import type { Statement } from '../d1/client';
import type { Fixture, MarketQuote, MarketType } from './types';
import { sameMatch } from './the-odds-prices';

/**
 * Odds imported by hand (owner decision 29.10): the owner exports the Stake football offer on his laptop
 * (stake-sports-api, `scripts/export_matches.py`) and uploads the JSON on /cote. Nothing here contacts Stake.
 *
 * Each Stake match is matched to the site's own fixture (both teams, kickoff within 15 minutes; spelling-tolerant). Its prices become the
 * fixture's main prices, exactly as exported (bookmaker "Stake"); markets Stake does not have stay from ESPN/The Odds
 * API in the background. Like The Odds API cache, prices are used as they are for IMPORTED_ODDS_MAX_AGE_MINUTES
 * (4 days) after the export, then the fixture falls back to its other sources. Only markets we can settle and whose
 * meaning is unambiguous are mapped: 1X2, goal totals and Asian totals (x.5 lines), Asian handicap (x.5 lines),
 * both teams to score, double chance.
 */
export const IMPORT_SOURCE = 'stake-import';
const BOOK = 'Stake';
const maxAgeMs = () => config.limits.importedOddsMaxAgeMinutes * 60_000;

export type ImportedMarket = { key: string; marketType: MarketType; odds: number; line?: number };
export type ImportedEvent = { sourceId: string; home: string; away: string; league: string | null; kickoff: string; capturedAt: string; markets: ImportedMarket[] };
export type ParsedExport = { capturedAt: string; events: ImportedEvent[]; stats: { matches: number; priced: number; mapped: Record<string, number>; skipped: Record<string, number> } };
export class ImportError extends Error {}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ── Matching a Stake match to the site's fixture ───────────────────────────────
// Bookmakers spell clubs differently ("Stade Rennais"/"Rennes", "D.C. United"/"DC United", "Villarreal"/"Villareal").
// Both teams must still match, at the same kickoff (±15 min): the strict rule first, then these tolerant ones.
const ALIASES: string[][] = [['koln', 'cologne', 'koeln'], ['rennes', 'rennais'], ['athletic bilbao', 'athletic club'], ['hamkam', 'hamarkameratene'],
  ['athletico', 'paranaense'], ['internazionale', 'inter milan'], ['paris saint germain', 'psg', 'paris sg'], ['manchester united', 'man utd', 'man united'],
  ['tottenham', 'spurs'], ['wolverhampton', 'wolves'], ['nottingham forest', 'nottm forest'], ['munchen', 'munich'], ['monchengladbach', 'gladbach'],
  ['sporting cp', 'sporting lisbon'], ['olympique lyonnais', 'lyon'], ['olympique marseille', 'marseille'], ['bayern', 'bayern munich']];
const compact = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '');
const tokens = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 4);
const edit1 = (a: string, b: string) => {
  if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++diff > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return diff + (a.length - i) + (b.length - j) <= 1;
};
const alias = (a: string, b: string) => { const x = norm(a), y = norm(b); return ALIASES.some((g) => g.some((n) => x.includes(n)) && g.some((n) => y.includes(n))); };
export function looseTeam(a: string, b: string) {
  const x = compact(a), y = compact(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 4 && long.includes(short)) return true;
  if (short.length >= 6 && edit1(x, y)) return true;
  if (tokens(a).some((u) => u.length >= 5 && tokens(b).some((v) => v.length >= 5 && edit1(u, v)))) return true;
  return alias(a, b);
}
/** Same match: kickoff within 15 minutes and both teams the same (strict rule, else the tolerant one on each side). */
export function sameImportedMatch(f: { home: string; away: string; kickoff: string }, e: { home: string; away: string; kickoff: string }) {
  if (Math.abs(Date.parse(f.kickoff) - Date.parse(e.kickoff)) > 15 * 60_000) return false;
  return sameMatch(f, e) || (looseTeam(f.home, e.home) && looseTeam(f.away, e.away));
}

const ONE_X_TWO = new Set(['1x2', 'winner', 'match winner', 'full time result', 'fulltime result', '3way', 'match result']);
// Asian Total on a x.5 line settles exactly like a plain total (no push), so only those lines are taken.
const TOTALS = new Set(['total', 'totals', 'total goals', 'over/under', 'goals over/under', 'total - goals', 'asian total']);
const HANDICAP = new Set(['asian handicap', 'handicap']);
const BTTS = new Set(['both teams to score', 'both teams score', 'btts', 'gg/ng']);
const DOUBLE = new Set(['double chance']);

/** Label in Romanian for a canonical key, with the site's own team names. */
export function labelFor(key: string, home: string, away: string): string {
  const [family, a, b] = key.split(':');
  if (family === '1X2') return a === 'HOME' ? `${home} câștigă (1)` : a === 'AWAY' ? `${away} câștigă (2)` : 'Egal (X)';
  if (family === 'DC') return a === '1X' ? `${home} sau egal (1X)` : a === 'X2' ? `Egal sau ${away} (X2)` : `${home} sau ${away} (12)`;
  if (family === 'BTTS') return `Ambele echipe marchează – ${a === 'YES' ? 'DA' : 'NU'}`;
  if (family === 'TOTAL') return `${a === 'OVER' ? 'Peste' : 'Sub'} ${b} goluri`;
  if (family === 'AH') { const n = Number(b); return `${a === 'HOME' ? home : away} handicap ${n > 0 ? '+' : ''}${n}`; }
  return key;
}

/** Pure: one Stake market → our canonical selections (empty when the meaning is not certain). */
function mapMarket(m: Obj, home: string, away: string): { family: string | null; quotes: ImportedMarket[] } {
  const name = norm(str(m.name) || str(m.template));
  const status = norm(str(m.status));
  if (status && !['active', 'open', '1'].includes(status)) return { family: null, quotes: [] };
  const outcomes = arr(m.outcomes).map(obj).filter((o) => o.active !== false)
    .map((o) => ({ n: norm(str(o.name)), odds: Number(o.odds) })).filter((o) => o.odds > 1.01 && o.odds < 100);
  const h = norm(home), a = norm(away);
  const isHome = (n: string) => n === h || n === '1' || n === 'home' || n.includes('competitor1');
  const isAway = (n: string) => n === a || n === '2' || n === 'away' || n.includes('competitor2');
  const isDraw = (n: string) => n === 'draw' || n === 'x' || n === 'egal';
  if (ONE_X_TWO.has(name)) {
    const pick = (f: (n: string) => boolean) => outcomes.filter((o) => f(o.n));
    const [H, D, A] = [pick(isHome), pick(isDraw), pick(isAway)];
    // A complete 1X2 only: exactly one price per side, never a partial listing.
    if (H.length !== 1 || D.length !== 1 || A.length !== 1) return { family: '1X2', quotes: [] };
    return { family: '1X2', quotes: [
      { key: '1X2:HOME', marketType: '1X2', odds: r3(H[0].odds) },
      { key: '1X2:DRAW', marketType: '1X2', odds: r3(D[0].odds) },
      { key: '1X2:AWAY', marketType: '1X2', odds: r3(A[0].odds) },
    ] };
  }
  if (TOTALS.has(name)) {
    const spec = /total=([\d.]+)/.exec(str(m.specifiers));
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      const x = /^(over|under|peste|sub)\s*([\d.]+)?$/.exec(o.n);
      const line = Number(x?.[2] ?? spec?.[1]);
      if (!x || !Number.isFinite(line) || Math.abs(line % 1) !== 0.5) continue;
      const dir = x[1] === 'over' || x[1] === 'peste' ? 'OVER' : 'UNDER';
      quotes.push({ key: `TOTAL:${dir}:${line}`, marketType: 'TOTAL', odds: r3(o.odds), line });
    }
    return { family: 'TOTAL', quotes };
  }
  if (HANDICAP.has(name)) {
    // Each outcome carries its own team and line, e.g. "Huracan (-0.5)": x.5 lines only (no push).
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      const x = /^(.*?)\s*\(([+-]?\d+(?:\.\d+)?)\)$/.exec(o.n);
      const line = Number(x?.[2]);
      if (!x || !Number.isFinite(line) || Math.abs(line % 1) !== 0.5) continue;
      const side = isHome(x[1].trim()) ? 'HOME' : isAway(x[1].trim()) ? 'AWAY' : null;
      if (side) quotes.push({ key: `AH:${side}:${line}`, marketType: 'HANDICAP', odds: r3(o.odds), line });
    }
    return { family: 'AH', quotes };
  }
  if (BTTS.has(name)) {
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      if (['yes', 'da', 'gg'].includes(o.n)) quotes.push({ key: 'BTTS:YES', marketType: 'BTTS', odds: r3(o.odds) });
      else if (['no', 'nu', 'ng'].includes(o.n)) quotes.push({ key: 'BTTS:NO', marketType: 'BTTS', odds: r3(o.odds) });
    }
    return { family: 'BTTS', quotes };
  }
  if (DOUBLE.has(name)) {
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      const short = o.n.replace(/\s/g, '');
      const hasH = o.n.includes(h) || o.n.includes('competitor1'), hasA = o.n.includes(a) || o.n.includes('competitor2'), hasD = /\bdraw\b|\begal\b/.test(o.n);
      const k = short === '1x' || (hasH && hasD && !hasA) ? '1X' : short === 'x2' || (hasA && hasD && !hasH) ? 'X2' : short === '12' || (hasH && hasA && !hasD) ? '12' : null;
      if (k) quotes.push({ key: `DC:${k}`, marketType: 'DOUBLE_CHANCE', odds: r3(o.odds) });
    }
    return { family: 'DC', quotes };
  }
  return { family: null, quotes: [] };
}

/** Pure: the JSON written by `scripts/export_matches.py` (or one `/v1/matches` page) → events with our keys. */
export function parseStakeExport(raw: unknown): ParsedExport {
  const root = obj(raw); const meta = obj(root.meta);
  const capturedAt = str(meta.finished_at) || str(meta.fetched_at) || str(meta.started_at);
  if (!Number.isFinite(Date.parse(capturedAt))) throw new ImportError('Fișierul nu are momentul exportului (meta.finished_at); nu pot ști cât de proaspete sunt cotele.');
  if (meta.source && str(meta.source) !== 'stake') throw new ImportError('Fișierul nu este un export Stake.');
  const matches = arr(obj(root.data).matches ?? root.matches).map(obj);
  const stats: ParsedExport['stats'] = { matches: matches.length, priced: 0, mapped: {}, skipped: {} };
  const events: ImportedEvent[] = [];
  for (const m of matches) {
    const parts = arr(m.participants).map(obj).map((p) => str(p.name).trim());
    const [home, away] = parts.length >= 2 ? parts : str(m.name).split(/\s+(?:vs\.?|-|–)\s+/).map((s) => s.trim());
    const sourceId = str(m.source_id), kickoff = Date.parse(str(m.starts_at));
    if (!sourceId || !home || !away || !Number.isFinite(kickoff)) continue;
    const byKey = new Map<string, ImportedMarket>();
    for (const market of arr(m.markets).map(obj)) {
      const { family, quotes } = mapMarket(market, home, away);
      if (!family) { const n = str(market.name) || str(market.template) || '?'; stats.skipped[n] = (stats.skipped[n] ?? 0) + 1; continue; }
      for (const q of quotes) if (!byKey.has(q.key)) byKey.set(q.key, q);
      if (quotes.length) stats.mapped[family] = (stats.mapped[family] ?? 0) + 1;
    }
    if (!byKey.size) continue;
    stats.priced++;
    const t = obj(m.tournament);
    events.push({ sourceId, home, away, league: str(t.name) || null, kickoff: new Date(kickoff).toISOString(), capturedAt: new Date(capturedAt).toISOString(), markets: [...byKey.values()] });
  }
  return { capturedAt: new Date(capturedAt).toISOString(), events, stats };
}

/** Pure: the imported prices become the fixture's main prices; its other markets stay in the background.
 * When The Odds API prices on the fixture are newer than the export, those stay main and Stake only fills gaps. */
export function mergeImported(f: Fixture, e: ImportedEvent): Fixture {
  const quotes: MarketQuote[] = e.markets.map((m) => ({ ...m, label: labelFor(m.key, f.home, f.away), bookmaker: BOOK }));
  const own = f.odds?.markets ?? [];
  if (f.odds && f.odds.source === 'the-odds-api' && Date.parse(f.odds.observedAt) > Date.parse(e.capturedAt)) {
    const have = new Set(own.map((m) => m.key));
    const extra = quotes.filter((q) => !have.has(q.key));
    return extra.length ? { ...f, odds: { ...f.odds, markets: [...own, ...extra] } } : f;
  }
  const keys = new Set(quotes.map((q) => q.key));
  const background = own.filter((m) => !keys.has(m.key)).map((m) => ({ ...m, bookmaker: m.bookmaker ?? f.odds?.bookmaker }));
  return { ...f, odds: { bookmaker: BOOK, source: IMPORT_SOURCE, observedAt: e.capturedAt, providerUpdatedAt: e.capturedAt, markets: [...quotes, ...background] } };
}

type Row = { source_id: string; home: string; away: string; league: string | null; kickoff_utc: string | Date; markets: string | ImportedMarket[]; captured_at: string | Date };
const iso = (v: string | Date) => new Date(v).toISOString();

/** Adds the imported prices (at most 4 days old) to the open fixtures they cover. No network. */
export async function withImportedPrices(fixtures: Fixture[]): Promise<Fixture[]> {
  const open = fixtures.filter((f) => f.status === 'pre' && Number.isFinite(Date.parse(f.kickoff)));
  if (!open.length) return fixtures;
  const times = open.map((f) => Date.parse(f.kickoff));
  const rows = await many<Row>(
    `SELECT source_id,home,away,league,kickoff_utc,markets,captured_at FROM imported_odds
      WHERE source='stake' AND kickoff_utc >= $1 AND kickoff_utc <= $2 AND captured_at >= $3`,
    [new Date(Math.min(...times) - 20 * 60_000).toISOString(), new Date(Math.max(...times) + 20 * 60_000).toISOString(), new Date(Date.now() - maxAgeMs()).toISOString()],
  ).catch(() => [] as Row[]);
  if (!rows.length) return fixtures;
  const events: ImportedEvent[] = rows.map((r) => ({ sourceId: r.source_id, home: r.home, away: r.away, league: r.league, kickoff: iso(r.kickoff_utc), capturedAt: iso(r.captured_at),
    markets: typeof r.markets === 'string' ? JSON.parse(r.markets) : r.markets }));
  // Kickoff first (cheap), names only for the few events starting within 15 minutes of the fixture.
  const timed = events.map((e) => ({ e, t: Date.parse(e.kickoff) }));
  return fixtures.map((f) => {
    if (f.status !== 'pre') return f;
    const t = Date.parse(f.kickoff);
    const near = timed.filter((x) => Math.abs(x.t - t) <= 15 * 60_000).map((x) => x.e);
    const e = near.find((x) => sameMatch(f, x)) ?? near.find((x) => sameImportedMatch(f, x));
    return e ? mergeImported(f, e) : f;
  });
}

/** Saves an export (newest capture wins per match), drops past matches and re-prices the stored catalog at once. */
export async function importStakeExport(raw: unknown) {
  const parsed = parseStakeExport(raw);
  const age = Date.now() - Date.parse(parsed.capturedAt);
  if (age > maxAgeMs()) throw new ImportError(`Exportul are ${Math.round(age / 3600_000)} ore; cotele mai vechi de ${Math.round(maxAgeMs() / 3600_000)} ore nu mai sunt folosite. Fă un export nou pe laptop.`);
  if (age < -10 * 60_000) throw new ImportError('Momentul exportului este în viitor; verifică ceasul laptopului.');
  const upcoming = parsed.events.filter((e) => Date.parse(e.kickoff) > Date.now());
  if (!upcoming.length) throw new ImportError('Fișierul nu conține meciuri viitoare cu cote recunoscute.');
  const statements: Statement[] = upcoming.map((e) => ({
    text: `INSERT INTO imported_odds(source,source_id,home,away,league,kickoff_utc,markets,captured_at,imported_at) VALUES('stake',$1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(source,source_id) DO UPDATE SET home=EXCLUDED.home,away=EXCLUDED.away,league=EXCLUDED.league,kickoff_utc=EXCLUDED.kickoff_utc,
        markets=EXCLUDED.markets,captured_at=EXCLUDED.captured_at,imported_at=EXCLUDED.imported_at
      WHERE EXCLUDED.captured_at >= imported_odds.captured_at`,
    params: [e.sourceId, e.home, e.away, e.league, e.kickoff, JSON.stringify(e.markets), e.capturedAt, new Date().toISOString()],
  }));
  for (let i = 0; i < statements.length; i += 50) await atomic(statements.slice(i, i + 50));
  await atomic([{ text: `DELETE FROM imported_odds WHERE kickoff_utc < $1`, params: [new Date(Date.now() - 6 * 3600_000).toISOString()] }]);
  const matched = await repriceCatalog();
  return { capturedAt: parsed.capturedAt, saved: upcoming.length, matchedFixtures: matched, stats: parsed.stats };
}

/** Writes the merged prices of the next 8 days' stored fixtures, so new analyses see them right away. */
async function repriceCatalog() {
  const { loadFixtures, persistFixtures } = await import('./fixtures');
  const { localDate } = await import('../time');
  const { fixtures } = await loadFixtures(localDate(), 8, { top10Only: false, persist: false });
  const merged = await withImportedPrices(fixtures);
  const changed = merged.filter((f, i) => f !== fixtures[i] && f.odds?.markets.some((m) => m.bookmaker === BOOK));
  await persistFixtures(changed);
  return changed.length;
}

/** What /cote shows: the latest import and how much of it is still usable. */
export async function importStatus() {
  const r = await one<{ n: number | string; fresh: number | string; captured: string | Date | null; first: string | Date | null; last: string | Date | null }>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN captured_at >= $1 AND kickoff_utc > $2 THEN 1 ELSE 0 END) AS fresh, MAX(captured_at) AS captured, MIN(kickoff_utc) AS first, MAX(kickoff_utc) AS last
       FROM imported_odds WHERE source='stake'`, [new Date(Date.now() - maxAgeMs()).toISOString(), new Date().toISOString()]).catch(() => null);
  return { matches: Number(r?.n ?? 0), usable: Number(r?.fresh ?? 0), capturedAt: r?.captured ? iso(r.captured) : null, first: r?.first ? iso(r.first) : null, last: r?.last ? iso(r.last) : null, maxAgeHours: Math.round(maxAgeMs() / 3600_000) };
}
