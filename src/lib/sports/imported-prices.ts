import { config } from '../config';
import { atomic, many, one } from '../db';
import type { Statement } from '../d1/client';
import type { Fixture, MarketQuote, MarketType } from './types';
import { sameMatch } from './the-odds-prices';
import { csLabel, isCsKey, swapSide } from '../cs/markets';
import { historyStatements } from './odds-movement';
import { sameCsMatch } from '../cs/teams';

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
export type ImportedEvent = { sourceId: string; home: string; away: string; league: string | null; kickoff: string; capturedAt: string; markets: ImportedMarket[]; category?: string | null; tournamentSlug?: string | null };

/** Stake's simulated / virtual football ("SRL", eFootball): not real matches, never imported. */
export const isVirtualLeague = (name: string | null | undefined) => !!name && /\bSRL\b|simulated|e-?football|esoccer|e-soccer|virtual|cyber/i.test(name);
export type ParsedExport = { capturedAt: string; events: ImportedEvent[]; stats: { matches: number; priced: number; mapped: Record<string, number>; skipped: Record<string, number> } };
export class ImportError extends Error {}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/[łľ]/g, 'l').replace(/đ/g, 'd').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ── Matching a Stake match to the site's fixture ───────────────────────────────
// Bookmakers spell clubs differently ("Stade Rennais"/"Rennes", "D.C. United"/"DC United", "Villarreal"/"Villareal").
// Both teams must still match, at the same kickoff (±15 min): the strict rule first, then these tolerant ones.
const ALIASES: string[][] = [['koln', 'cologne', 'koeln'], ['rennes', 'rennais'], ['athletic bilbao', 'athletic club'], ['hamkam', 'hamarkameratene'],
  ['athletico', 'paranaense'], ['internazionale', 'inter milan'], ['paris saint germain', 'psg', 'paris sg'], ['manchester united', 'man utd', 'man united'],
  ['tottenham', 'spurs'], ['wolverhampton', 'wolves'], ['nottingham forest', 'nottm forest'], ['munchen', 'munich'], ['monchengladbach', 'gladbach'],
  ['sporting cp', 'sporting lisbon'], ['olympique lyonnais', 'lyon'], ['olympique marseille', 'marseille'], ['bayern', 'bayern munich'],
  // 02.11: city exonyms and club nicknames seen between Stake and ESPN.
  ['kobenhavn', 'copenhagen'], ['red star', 'crvena zvezda'], ['aarhus', 'agf'], ['brondby', 'broendby'], ['praha', 'prague'], ['beograd', 'belgrade'],
  ['warszawa', 'warsaw'], ['bucuresti', 'bucharest'], ['kyiv', 'kiev'], ['moskva', 'moscow'], ['goteborg', 'gothenburg'], ['zurich', 'zuerich'],
  ['sevilla', 'seville'], ['lisboa', 'lisbon'], ['plzen', 'pilsen'], ['dinamo zagreb', 'gnk dinamo'], ['crb', 'cr brasil'], ['sport recife', 'sc recife']];
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
/** Reserve, youth and women's sides carry their own markers: never the same team as the first team. */
const SIDE_MARK = /\b(women|woman|femin|ladies|w|u ?1[5-9]|u ?2[0-3]|ii|b|reserves?|youth|juniors?|jong|primavera)\b/;
// Words that many clubs share: never enough alone to say two names are the same club.
const GENERIC = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'as', 'us', 'ss', 'cd', 'ud', 'sd', 'ec', 'fk', 'nk', 'sk', 'if', 'bk', 'club', 'de', 'del', 'la', 'el', 'al',
  'united', 'city', 'town', 'rovers', 'albion', 'athletic', 'atletico', 'athletico', 'deportivo', 'independiente', 'sporting', 'real', 'racing', 'sport', 'sports',
  'olympique', 'dinamo', 'dynamo', 'inter', 'internacional', 'nacional', 'universidad', 'union', 'wanderers', 'county', 'fodbold', 'fotball', 'football', 'futbol',
  'calcio', 'pae', 'ps', 'pr', 'pe', 'go', 'al', 'sp', 'rj', 'mg', 'rs', 'ba', 'esporte', 'clube', 'sociedad', 'gimnasia', 'esportiva']);
const core = (s: string) => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3 && !GENERIC.has(w));
/** Strict one-team test for the one-side rule: a distinctive word in common (or an alias), never only generic words. */
const sameClub = (a: string, b: string) => {
  const x = core(a), y = core(b);
  if (alias(a, b)) return true;
  return x.some((u) => u.length >= 4 && y.some((v) => v === u || (u.length >= 6 && v.length >= 6 && edit1(u, v))));
};
const marks = (s: string) => (norm(s).replace(/[^a-z0-9 ]+/g, ' ').match(new RegExp(SIDE_MARK.source, 'g')) ?? []).sort().join(',');

/**
 * The imported event of a fixture: both teams the same (strict, then tolerant), else (02.11) one team the same on
 * the same side at the same kickoff (±10 min) when exactly one event qualifies, and neither side is a reserve/youth/
 * women team the other is not. A club cannot play two matches at once, so "Goiás – CRB" is "Goias EC GO – CR Brasil AL".
 */
export function findImported<E extends { home: string; away: string; kickoff: string }>(f: { home: string; away: string; kickoff: string }, near: E[]): E | undefined {
  const strict = near.find((x) => sameMatch(f, x)) ?? near.find((x) => sameImportedMatch(f, x));
  if (strict) return strict;
  const t = Date.parse(f.kickoff);
  const one = near.filter((x) => Math.abs(Date.parse(x.kickoff) - t) <= 10 * 60_000
    && marks(x.home) === marks(f.home) && marks(x.away) === marks(f.away)
    && (sameClub(f.home, x.home) || sameClub(f.away, x.away)));
  return one.length === 1 ? one[0] : undefined;
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
  if (isCsKey(key)) return csLabel(key, home, away);
  const [family, a, b] = key.split(':');
  if (family === '1X2') return a === 'HOME' ? `${home} câștigă (1)` : a === 'AWAY' ? `${away} câștigă (2)` : 'Egal (X)';
  if (family === 'DC') return a === '1X' ? `${home} sau egal (1X)` : a === 'X2' ? `Egal sau ${away} (X2)` : `${home} sau ${away} (12)`;
  if (family === 'BTTS') return `Ambele echipe marchează – ${a === 'YES' ? 'DA' : 'NU'}`;
  if (family === 'TOTAL') return `${a === 'OVER' ? 'Peste' : 'Sub'} ${b} goluri`;
  if (family === 'AH') { const n = Number(b); return `${a === 'HOME' ? home : away} handicap ${n > 0 ? '+' : ''}${n}`; }
  const team = (x: string) => (x === 'HOME' ? home : away);
  if (family === 'TT') return `${team(a)} ${b === 'OVER' ? 'peste' : 'sub'} ${key.split(':')[3]} goluri`;
  if (family === 'X2T') return `${a === 'DRAW' ? 'Egal' : `${team(a)} câștigă`} și ${b === 'OVER' ? 'peste' : 'sub'} ${key.split(':')[3]} goluri`;
  if (family === 'TBTTS') return `${a === 'OVER' ? 'Peste' : 'Sub'} ${b} goluri și ambele marchează – ${key.split(':')[3] === 'YES' ? 'DA' : 'NU'}`;
  if (family === 'EG') return a.endsWith('+') ? `${a.slice(0, -1)} sau mai multe goluri în meci` : `Exact ${a} ${a === '1' ? 'gol' : 'goluri'} în meci`;
  if (family === 'MG') return a.endsWith('+') ? `${a.slice(0, -1)} sau mai multe goluri în meci` : `Între ${a.replace('-', ' și ')} goluri în meci`;
  if (family === 'WTN') return b === 'YES' ? `${team(a)} câștigă fără să primească gol` : `${team(a)} nu câștigă fără să primească gol`;
  if (family === 'EH') return `${a === 'DRAW' ? 'Egal' : team(a)} la handicap european (${b}:${key.split(':')[3]})`;
  if (family === 'X2B') return `${a === 'DRAW' ? 'Egal' : `${team(a)} câștigă`} și ambele echipe marchează – ${b === 'YES' ? 'DA' : 'NU'}`;
  if (family === 'H1B') return `${a === 'DRAW' ? 'Egal la pauză' : `${team(a)} conduce la pauză`} și ambele marchează în prima repriză – ${b === 'YES' ? 'DA' : 'NU'}`;
  if (family === 'HT1X2') return a === 'DRAW' ? 'Egal în prima repriză' : `${team(a)} câștigă prima repriză`;
  if (family === 'HTTOT') return `${a === 'OVER' ? 'Peste' : 'Sub'} ${b} goluri în prima repriză`;
  if (family === 'H2TOT') return `${a === 'OVER' ? 'Peste' : 'Sub'} ${b} goluri în repriza a doua`;
  if (family === 'HDC') return a === '1X' ? `${home} sau egal în prima repriză (1X)` : a === 'X2' ? `Egal sau ${away} în prima repriză (X2)` : `${home} sau ${away} în prima repriză (12)`;
  if (family === 'HHB') return `Ambele marchează: prima repriză ${a === 'Y' ? 'DA' : 'NU'}, repriza a doua ${b === 'Y' ? 'DA' : 'NU'}`;
  if (family === 'HFT') { const r = (x: string) => (x === 'DRAW' ? 'egal' : team(x)); const k = key.split(':'); return `Pauză ${r(a)}, final ${r(b)} și ${k[3] === 'OVER' ? 'peste' : 'sub'} ${k[4]} goluri`; }
  if (family === 'CARD') return `${a === 'OVER' ? 'Peste' : 'Sub'} ${b} cartonașe`;
  if (family === 'CORN') return `${a === 'OVER' ? 'Peste' : 'Sub'} ${b} cornere`;
  if (family === 'TCORN') return `${team(a)} ${b === 'OVER' ? 'peste' : 'sub'} ${key.split(':')[3]} cornere`;
  return key;
}

/** Pure: one Stake market → our canonical selections (empty when the meaning is not certain). */
/** Counter-Strike export (`--sport-type esport`): winner, map handicap and total maps, x.5 lines only. */
function mapCsMarket(m: Obj, home: string, away: string): { family: string | null; quotes: ImportedMarket[] } {
  const name = norm(str(m.name) || str(m.template));
  const status = norm(str(m.status));
  if (status && !['active', 'open', '1'].includes(status)) return { family: null, quotes: [] };
  const outcomes = arr(m.outcomes).map(obj).filter((o) => o.active !== false).map((o) => ({ n: norm(str(o.name)), odds: Number(o.odds) })).filter((o) => o.odds > 1.01 && o.odds < 100);
  const h = norm(home), a = norm(away);
  const side = (n: string) => (n === h || n === '1' || n === 'home' ? 'HOME' : n === a || n === '2' || n === 'away' ? 'AWAY' : null);
  const spec = (k: string) => { const x = new RegExp(`${k}=([+-]?[\\d.]+)`).exec(str(m.specifiers)); return x ? Number(x[1]) : NaN; };
  // Stake: "Match Winner - Twoway"; never "Map 1 Winner" or "Match Winner / Map 1 Winner".
  if ((['winner', '1x2', '2way', 'moneyline'].includes(name) || name.startsWith('match winner')) && !/map/.test(name)) {
    if (outcomes.length !== 2) return { family: 'ML', quotes: [] };
    const q = outcomes.map((o) => ({ s: side(o.n), odds: o.odds }));
    if (!q.every((x) => x.s) || q[0].s === q[1].s) return { family: 'ML', quotes: [] };
    return { family: 'ML', quotes: q.map((x) => ({ key: `ML:${x.s}`, marketType: 'MONEYLINE' as const, odds: r3(x.odds) })) };
  }
  if (/handicap/.test(name) && !/round/.test(name) && !/map \d/.test(name)) {
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      const x = /^(.*?)\s*\(([+-]?\d+(?:\.\d+)?)\)$/.exec(o.n);
      const sd = x ? side(x[1].trim()) : null; const line = Number(x?.[2]);
      if (sd && Number.isFinite(line) && Math.abs(line % 1) === 0.5) quotes.push({ key: `MH:${sd}:${line}`, marketType: 'HANDICAP', odds: r3(o.odds), line });
    }
    return { family: 'MH', quotes };
  }
  if (/total/.test(name) && !/round|kill/.test(name) && !/map \d/.test(name)) {
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      const x = /^(over|under)\s*([\d.]+)?$/.exec(o.n); const line = Number(x?.[2] ?? spec('total'));
      if (x && Number.isFinite(line) && Math.abs(line % 1) === 0.5) quotes.push({ key: `MT:${x[1] === 'over' ? 'OVER' : 'UNDER'}:${line}`, marketType: 'TOTAL', odds: r3(o.odds), line });
    }
    return { family: 'MT', quotes };
  }
  return { family: null, quotes: [] };
}

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
  const tpl = norm(str(m.template));
  const spec = (k: string) => new RegExp(`${k}=([^;,\\s]+)`).exec(str(m.specifiers))?.[1];
  const sideOf = (n: string): 'HOME' | 'AWAY' | null => (isHome(n) ? 'HOME' : isAway(n) ? 'AWAY' : null);
  const halfLine = (x: unknown) => { const l = Number(x); return Number.isFinite(l) && Math.abs(l % 1) === 0.5 ? l : null; };
  // ── Half-time and combined markets (owner request 06.11): 1x2 & BTTS, 1st half 1x2 / total / double chance / 1x2 & BTTS,
  // 1st/2nd half BTTS and half-time/full-time & total. Settled from the final score plus the half-time score. Only complete
  // sets are kept; x.5 lines only. ──
  {
    const label = `${tpl} ${norm(str(m.name))}`.replace(/\{\$competitor[12]\}/g, '');
    const resOf = (n: string): 'HOME' | 'DRAW' | 'AWAY' | null => (isDraw(n) ? 'DRAW' : isHome(n) ? 'HOME' : isAway(n) ? 'AWAY' : null);
    const first = /1st half|first half/.test(label);
    const none = /corner|booking|card|odd|even|exact|handicap|minute|player|goalscorer|2nd half - /.test(label);
    if (!none && /halftime\/fulltime & total|half time\/full time & total|ht\/ft & total/.test(label)) {
      const quotes: ImportedMarket[] = [];
      for (const o of outcomes) {
        const x = /^(.+?)\s*\/\s*(.+?)\s*&\s*(over|under)\s*([\d.]+)$/.exec(o.n); if (!x) continue;
        const r1 = resOf(x[1].trim()), r2 = resOf(x[2].trim()), line = halfLine(x[4]);
        if (r1 && r2 && line !== null) quotes.push({ key: `HFT:${r1}:${r2}:${x[3] === 'over' ? 'OVER' : 'UNDER'}:${line}`, marketType: 'HALF', odds: r3(o.odds), line });
      }
      return { family: 'HFT', quotes: new Set(quotes.map((q) => q.key)).size === quotes.length ? quotes : [] };
    }
    if (!none && /1st\/2nd half both teams to score/.test(label)) {
      const quotes: ImportedMarket[] = [];
      for (const o of outcomes) { const x = /^(yes|no)\s*\/\s*(yes|no)$/.exec(o.n); if (x) quotes.push({ key: `HHB:${x[1] === 'yes' ? 'Y' : 'N'}:${x[2] === 'yes' ? 'Y' : 'N'}`, marketType: 'HALF', odds: r3(o.odds) }); }
      return { family: 'HHB', quotes: quotes.length === 4 && new Set(quotes.map((q) => q.key)).size === 4 ? quotes : [] };
    }
    if (!none && /1x2 & both teams to score/.test(label)) {
      const quotes: ImportedMarket[] = [];
      for (const o of outcomes) { const x = /^(.+?)\s*&\s*(yes|no)$/.exec(o.n); const side = x ? resOf(x[1].trim()) : null; if (x && side) quotes.push({ key: `${first ? 'H1B' : 'X2B'}:${side}:${x[2] === 'yes' ? 'YES' : 'NO'}`, marketType: first ? 'HALF' : 'COMBO', odds: r3(o.odds) }); }
      return { family: first ? 'H1B' : 'X2B', quotes: quotes.length === 6 && new Set(quotes.map((q) => q.key)).size === 6 ? quotes : [] };
    }
    if (!none && first && /double chance/.test(label)) {
      const quotes: ImportedMarket[] = [];
      for (const o of outcomes) {
        const hh = o.n.includes(h), aa = o.n.includes(a), dd = /draw|egal/.test(o.n);
        const k = hh && dd && !aa ? '1X' : aa && dd && !hh ? 'X2' : hh && aa && !dd ? '12' : null;
        if (k) quotes.push({ key: `HDC:${k}`, marketType: 'HALF', odds: r3(o.odds) });
      }
      return { family: 'HDC', quotes: quotes.length === 3 && new Set(quotes.map((q) => q.key)).size === 3 ? quotes : [] };
    }
    if (!none && first && /1x2$/.test(label.trim()) && !/&|total|score|handicap/.test(label)) {
      const pick = (f: (n: string) => boolean) => outcomes.filter((o) => f(o.n));
      const [H, D, A] = [pick(isHome), pick(isDraw), pick(isAway)];
      if (H.length === 1 && D.length === 1 && A.length === 1) return { family: 'HT1X2', quotes: [
        { key: 'HT1X2:HOME', marketType: 'HALF', odds: r3(H[0].odds) }, { key: 'HT1X2:DRAW', marketType: 'HALF', odds: r3(D[0].odds) }, { key: 'HT1X2:AWAY', marketType: 'HALF', odds: r3(A[0].odds) }] };
      return { family: 'HT1X2', quotes: [] };
    }
    if (!none && first && /total/.test(label) && !/&|and|team|score|btts|both|competitor/.test(label)) {
      const quotes: ImportedMarket[] = [];
      for (const o of outcomes) {
        const x = /^(over|under)\s*([\d.]+)?$/.exec(o.n); const line = halfLine(x?.[2] ?? spec('total'));
        if (x && line !== null) quotes.push({ key: `HTTOT:${x[1] === 'over' ? 'OVER' : 'UNDER'}:${line}`, marketType: 'HALF', odds: r3(o.odds), line });
      }
      if (quotes.length) return { family: 'HTTOT', quotes };
    }
    // Owner decision 08.11: 2nd-half goal total, x.5 lines only (Stake's "2nd Half - Asian Total"). Settled as the final score minus the half-time score.
    if (/2nd half|second half/.test(label) && /total/.test(label) && !/&|and|team|score|btts|both|competitor|corner|booking|card|exact|odd|even|minute|player/.test(label)) {
      const quotes: ImportedMarket[] = [];
      for (const o of outcomes) {
        const x = /^(over|under)\s*([\d.]+)?$/.exec(o.n); const line = halfLine(x?.[2] ?? spec('total'));
        if (x && line !== null) quotes.push({ key: `H2TOT:${x[1] === 'over' ? 'OVER' : 'UNDER'}:${line}`, marketType: 'HALF', odds: r3(o.odds), line });
      }
      if (quotes.length) return { family: 'H2TOT', quotes };
    }
  }
  // ── Corners (owner decision 06.11): full-time total and each team's total, x.5 lines, settled from ESPN's corner counts.
  // Half, range, odd/even, first/last corner, handicap and race markets are left out. Cards stay out until Stake's
  // booking-points rule is checked against what ESPN counts. ──
  {
    const label = `${tpl} ${norm(str(m.name))}`;
    if (/corner/.test(label) && !/1st|2nd|half|range|odd|even|first|last|handicap|exact|race|minute|1x2|and|&/.test(label.replace(/\{\$competitor[12]\}/g, ''))) {
      const quotes: ImportedMarket[] = [];
      const side: 'HOME' | 'AWAY' | null = tpl.includes('competitor1') ? 'HOME' : tpl.includes('competitor2') ? 'AWAY'
        : norm(str(m.name)).startsWith(h + ' ') ? 'HOME' : norm(str(m.name)).startsWith(a + ' ') ? 'AWAY' : null;
      const teamMarket = /competitor[12]/.test(tpl) || side !== null;
      for (const o of outcomes) {
        const x = /^(over|under)\s*([\d.]+)?$/.exec(o.n); const line = halfLine(x?.[2] ?? spec('total') ?? spec('line'));
        if (!x || line === null) continue;
        const dir = x[1] === 'over' ? 'OVER' : 'UNDER';
        if (teamMarket) { if (side) quotes.push({ key: `TCORN:${side}:${dir}:${line}`, marketType: 'CORNERS', odds: r3(o.odds), line }); }
        else quotes.push({ key: `CORN:${dir}:${line}`, marketType: 'CORNERS', odds: r3(o.odds), line });
      }
      if (quotes.length) return { family: teamMarket ? 'TCORN' : 'CORN', quotes };
    }
  }
  // ── Cards (owner decision 06.11): Stake's „Total Bookings”, x.5 lines. Stake counts a yellow as 1 and a red or yellow-red as 2
  // (sports rules, „Booking markets”); settlement uses the same weights. Booking points, team, half, first-booking,
  // player and sending-off markets are left out. ──
  {
    const label = `${tpl} ${norm(str(m.name))}`;
    if (/booking/.test(label) && !/point|1st|2nd|half|first|last|range|odd|even|1x2|player|sending|handicap|competitor|and|&/.test(label)) {
      const quotes: ImportedMarket[] = [];
      for (const o of outcomes) {
        const x = /^(over|under)\s*([\d.]+)?$/.exec(o.n); const line = halfLine(x?.[2] ?? spec('total') ?? spec('line'));
        if (x && line !== null) quotes.push({ key: `CARD:${x[1] === 'over' ? 'OVER' : 'UNDER'}:${line}`, marketType: 'CARDS', odds: r3(o.odds), line });
      }
      if (quotes.length) return { family: 'CARD', quotes };
    }
  }
  // ── Further Stake families, all settled on the full-time score (owner decision 06.11) ──
  if (tpl === '{$competitor1} total' || tpl === '{$competitor2} total') {
    const side = tpl.includes('competitor1') ? 'HOME' : 'AWAY'; const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      const x = /^(over|under)\s*([\d.]+)?$/.exec(o.n); const line = halfLine(x?.[2] ?? spec('total'));
      if (x && line !== null) quotes.push({ key: `TT:${side}:${x[1] === 'over' ? 'OVER' : 'UNDER'}:${line}`, marketType: 'TEAM_TOTAL', odds: r3(o.odds), line });
    }
    return { family: 'TT', quotes };
  }
  if (tpl === '1x2 & total') {
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      const x = /^(.*) & (over|under) ([\d.]+)$/.exec(o.n); const line = halfLine(x?.[3]);
      const side = x ? (isDraw(x[1].trim()) ? 'DRAW' : sideOf(x[1].trim())) : null;
      if (x && side && line !== null) quotes.push({ key: `X2T:${side}:${x[2] === 'over' ? 'OVER' : 'UNDER'}:${line}`, marketType: 'COMBO', odds: r3(o.odds), line });
    }
    return { family: 'X2T', quotes: quotes.length === 6 ? quotes : [] };
  }
  if (tpl === 'total & both teams to score') {
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      const x = /^(over|under) ([\d.]+) & (yes|no)$/.exec(o.n); const line = halfLine(x?.[2]);
      if (x && line !== null) quotes.push({ key: `TBTTS:${x[1] === 'over' ? 'OVER' : 'UNDER'}:${line}:${x[3] === 'yes' ? 'YES' : 'NO'}`, marketType: 'COMBO', odds: r3(o.odds), line });
    }
    return { family: 'TBTTS', quotes: quotes.length === 4 ? quotes : [] };
  }
  if (tpl === 'exact goals' && !/1st|2nd|half/.test(norm(str(m.name)))) {
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) if (/^\d+\+?$/.test(o.n)) quotes.push({ key: `EG:${o.n}`, marketType: 'EXACT_GOALS', odds: r3(o.odds) });
    return { family: 'EG', quotes };
  }
  if (tpl === 'multigoals') {
    const quotes: ImportedMarket[] = [];
    for (const o of outcomes) if (/^\d+-\d+$/.test(o.n) || /^\d+\+$/.test(o.n)) quotes.push({ key: `MG:${o.n}`, marketType: 'GOAL_RANGE', odds: r3(o.odds) });
    return { family: 'MG', quotes };
  }
  if (tpl === '{$competitor1} win to nil' || tpl === '{$competitor2} win to nil') {
    const side = tpl.includes('competitor1') ? 'HOME' : 'AWAY'; const quotes: ImportedMarket[] = [];
    for (const o of outcomes) if (o.n === 'yes' || o.n === 'no') quotes.push({ key: `WTN:${side}:${o.n === 'yes' ? 'YES' : 'NO'}`, marketType: 'WIN_TO_NIL', odds: r3(o.odds) });
    return { family: 'WTN', quotes };
  }
  if (tpl === 'handicap' && /hcp=\d+:\d+/.test(str(m.specifiers))) { // three-way (European) handicap, "Everton (0:1)"
    const hc = /hcp=(\d+):(\d+)/.exec(str(m.specifiers))!; const quotes: ImportedMarket[] = [];
    for (const o of outcomes) {
      const x = /^(.*?)\s*\((\d+):(\d+)\)$/.exec(o.n); if (!x || x[2] !== hc[1] || x[3] !== hc[2]) continue;
      const side = isDraw(x[1].trim()) ? 'DRAW' : sideOf(x[1].trim());
      if (side) quotes.push({ key: `EH:${side}:${hc[1]}:${hc[2]}`, marketType: 'EURO_HANDICAP', odds: r3(o.odds) });
    }
    return { family: 'EH', quotes: quotes.length === 3 && new Set(quotes.map((q) => q.key)).size === 3 ? quotes : [] };
  }
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
  const sport = str(meta.sport).toLowerCase();
  const esport = !!sport && sport !== 'soccer' && sport !== 'football';
  if (esport && !/counter|cs2|csgo/.test(sport)) throw new ImportError(`Fișierul este pentru „${sport}”; site-ul folosește doar fotbal și Counter-Strike.`);
  const stats: ParsedExport['stats'] = { matches: matches.length, priced: 0, mapped: {}, skipped: {} };
  const events: ImportedEvent[] = [];
  for (const m of matches) {
    const parts = arr(m.participants).map(obj).map((p) => str(p.name).trim());
    const [home, away] = parts.length >= 2 ? parts : str(m.name).split(/\s+(?:vs\.?|-|–)\s+/).map((s) => s.trim());
    const sourceId = str(m.source_id), kickoff = Date.parse(str(m.starts_at));
    if (!sourceId || !home || !away || !Number.isFinite(kickoff)) continue;
    if (!esport && isVirtualLeague(str(obj(m.tournament).name))) { stats.skipped['ligă virtuală (SRL)'] = (stats.skipped['ligă virtuală (SRL)'] ?? 0) + 1; continue; }
    const byKey = new Map<string, ImportedMarket>();
    for (const market of arr(m.markets).map(obj)) {
      const { family, quotes } = (esport ? mapCsMarket : mapMarket)(market, home, away);
      if (!family) { const n = str(market.name) || str(market.template) || '?'; stats.skipped[n] = (stats.skipped[n] ?? 0) + 1; continue; }
      for (const q of quotes) if (!byKey.has(q.key)) byKey.set(q.key, q);
      if (quotes.length) stats.mapped[family] = (stats.mapped[family] ?? 0) + 1;
    }
    if (!byKey.size) continue;
    stats.priced++;
    const t = obj(m.tournament);
    events.push({ sourceId, home, away, league: str(t.name) || null, kickoff: new Date(kickoff).toISOString(), capturedAt: new Date(capturedAt).toISOString(), markets: [...byKey.values()], category: str(t.category) || null, tournamentSlug: str(t.slug) || null });
  }
  return { capturedAt: new Date(capturedAt).toISOString(), events, stats };
}

/** Pure: the imported prices become the fixture's main prices; its other markets stay in the background.
 * When The Odds API prices on the fixture are newer than the export, those stay main and Stake only fills gaps. */
export function mergeImported(f: Fixture, e: ImportedEvent): Fixture {
  const quotes: MarketQuote[] = e.markets.map((m) => ({ ...m, label: labelFor(m.key, f.home, f.away), bookmaker: BOOK }));
  const own = f.odds?.markets ?? [];
  if (!config.limits.stakeOnlyOffer && f.odds && f.odds.source === 'the-odds-api' && Date.parse(f.odds.observedAt) > Date.parse(e.capturedAt)) {
    const have = new Set(own.map((m) => m.key));
    const extra = quotes.filter((q) => !have.has(q.key));
    return extra.length ? { ...f, odds: { ...f.odds, markets: [...own, ...extra] } } : f;
  }
  const keys = new Set(quotes.map((q) => q.key));
  // Stake-only offer (02.11): the agents see Stake's markets alone, nothing from ESPN / The Odds API in the background.
  const background = config.limits.stakeOnlyOffer ? [] : own.filter((m) => !keys.has(m.key)).map((m) => ({ ...m, bookmaker: m.bookmaker ?? f.odds?.bookmaker }));
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
    [new Date(Math.min(...times) - 35 * 60_000).toISOString(), new Date(Math.max(...times) + 35 * 60_000).toISOString(), new Date(Date.now() - maxAgeMs()).toISOString()],
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
    if (f.provider === 'pandascore') {
      // Counter-Strike: only CS prices, teams may be listed in the other order, schedules slip up to 30 minutes.
      const cs = timed.filter((x) => Math.abs(x.t - t) <= 30 * 60_000 && x.e.markets.some((m) => isCsKey(m.key)));
      for (const { e } of cs) {
        const o = sameCsMatch(f, e);
        if (o) return mergeImported(f, o === 'same' ? e : { ...e, home: e.away, away: e.home, markets: e.markets.map((m) => ({ ...m, key: swapSide(m.key) })) });
      }
      return f;
    }
    if (f.provider === 'stake') { const own = events.find((x) => x.sourceId === f.providerId); return own ? mergeImported(f, own) : f; }
    const e = findImported(f, near.filter((x) => !x.markets.some((m) => isCsKey(m.key))));
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
    text: `INSERT INTO imported_odds(source,source_id,home,away,league,kickoff_utc,markets,captured_at,imported_at,category,tournament_slug) VALUES('stake',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(source,source_id) DO UPDATE SET home=EXCLUDED.home,away=EXCLUDED.away,league=EXCLUDED.league,kickoff_utc=EXCLUDED.kickoff_utc,
        markets=EXCLUDED.markets,captured_at=EXCLUDED.captured_at,imported_at=EXCLUDED.imported_at,category=EXCLUDED.category,tournament_slug=EXCLUDED.tournament_slug
      WHERE EXCLUDED.captured_at >= imported_odds.captured_at`,
    params: [e.sourceId, e.home, e.away, e.league, e.kickoff, JSON.stringify(e.markets), e.capturedAt, new Date().toISOString(), e.category ?? null, e.tournamentSlug ?? null],
  }));
  for (let i = 0; i < statements.length; i += 50) await atomic(statements.slice(i, i + 50));
  // Odds movement: the main prices of this capture; a missing table must never break an import.
  try {
    const hist = historyStatements(upcoming);
    for (let i = 0; i < hist.length; i += 50) await atomic(hist.slice(i, i + 50));
    await atomic([{ text: `DELETE FROM imported_odds_history WHERE kickoff_utc < $1`, params: [new Date(Date.now() - 7 * 24 * 3600_000).toISOString()] }]);
  } catch { /* history is optional */ }
  await atomic([{ text: `DELETE FROM imported_odds WHERE kickoff_utc < $1`, params: [new Date(Date.now() - 6 * 3600_000).toISOString()] }]);
  const matched = await repriceCatalog();
  // Football Stake lists but the ESPN schedule does not: fixtures of their own, so the agents see the whole offer.
  const stakeOnly = parsed.events.some((e) => e.markets.some((m) => isCsKey(m.key))) ? 0 : await addStakeOnlyFixtures(upcoming);
  return { capturedAt: parsed.capturedAt, saved: upcoming.length, matchedFixtures: matched, stakeOnlyFixtures: stakeOnly, stats: parsed.stats };
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

const slugify = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const title = (v: string) => v.split(/[-_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** The site league of a Stake tournament (one league per country + tournament, created on first sight). */
export function stakeLeague(e: Pick<ImportedEvent, 'league' | 'category' | 'tournamentSlug'>) {
  const category = slugify(e.category ?? '') || 'international';
  const slug = slugify(e.tournamentSlug ?? e.league ?? '') || 'altele';
  return { id: `STK-${category}-${slug}`.slice(0, 64), provider: 'stake' as const, providerKey: `${category}/${slug}`, name: e.league ?? title(slug), country: title(category) };
}

/** Pure: the Stake-only fixture of an event (prices exactly as exported). */
export function stakeFixture(e: ImportedEvent): Fixture {
  const l = stakeLeague(e);
  const quotes: MarketQuote[] = e.markets.map((m) => ({ ...m, label: labelFor(m.key, e.home, e.away), bookmaker: BOOK }));
  return { id: `stk:${e.sourceId}`, provider: 'stake', providerId: e.sourceId, leagueId: l.id, leagueKey: l.providerKey, leagueName: l.name, country: l.country,
    home: e.home, away: e.away, kickoff: e.kickoff, status: 'pre', homeScore: null, awayScore: null, fetchedAt: e.capturedAt,
    odds: { bookmaker: BOOK, source: IMPORT_SOURCE, observedAt: e.capturedAt, providerUpdatedAt: e.capturedAt, markets: quotes } };
}

/**
 * Pure: the events to offer as Stake-only fixtures. A Stake tournament with at least one match found in the ESPN/LPF
 * schedule is covered by ESPN: its other matches are spelling mismatches ("Copenhagen" / "F.C. København") or later
 * rounds ESPN has not listed yet, never separate matches, so they wait for the schedule instead of being duplicated.
 */
/** Stake tournaments whose matches the ESPN schedule already carries (league configured on the site): never Stake-only. */
const ESPN_COVERED = new Set([
  'switzerland/super-league', 'israel/premier-league', 'norway/1st-division', 'sweden/superettan', 'turkiye/1-lig', 'greece/super-league-1',
  'italy/serie-c-group-a', 'italy/serie-c-group-b', 'italy/serie-c-group-c', 'czechia/1-liga', 'international-clubs/copa-libertadores',
  'international-clubs/copa-sudamericana', 'international-clubs/uefa-champions-league', 'international-clubs/uefa-europa-league',
  'international-clubs/uefa-europa-conference-league', 'denmark/superligaen', 'denmark/1st-division', 'saudi-arabia/saudi-prof-league',
  'brazil/brasileiro-serie-a', 'brazil/brasileiro-serie-b', 'argentina/liga-profesional',
]);

export function stakeOnlyEvents(events: ImportedEvent[], known: Array<{ home: string; away: string; kickoff: string; t: number }>) {
  const matches = (e: ImportedEvent) => { const t = Date.parse(e.kickoff); return known.some((f) => Math.abs(f.t - t) <= 15 * 60_000 && findImported(f, [e]) === e); };
  const found = events.filter(matches);
  const covered = new Set(found.map((e) => stakeLeague(e).id));
  return events.filter((e) => !found.includes(e) && !covered.has(stakeLeague(e).id) && !ESPN_COVERED.has(stakeLeague(e).providerKey));
}

/** Stake football events no ESPN/LPF fixture covers become fixtures of their own (and their leagues). */
async function addStakeOnlyFixtures(events: ImportedEvent[]) {
  if (!config.limits.stakeOnlyOffer || !events.length) return 0;
  const times = events.map((e) => Date.parse(e.kickoff));
  const rows = await many<{ id: string; home_team: string; away_team: string; kickoff_utc: string | Date; provider: string }>(
    `SELECT id,home_team,away_team,kickoff_utc,provider FROM fixtures WHERE provider NOT IN ('stake','pandascore') AND kickoff_utc >= $1 AND kickoff_utc <= $2`,
    [new Date(Math.min(...times) - 35 * 60_000).toISOString(), new Date(Math.max(...times) + 35 * 60_000).toISOString()]);
  const known = rows.map((r) => ({ home: r.home_team, away: r.away_team, kickoff: iso(r.kickoff_utc), t: Date.parse(iso(r.kickoff_utc)) }));
  const unmatched = stakeOnlyEvents(events, known);
  const missing = unmatched;
  if (!missing.length) return 0;
  const leagues = new Map(missing.map((e) => { const l = stakeLeague(e); return [l.id, l] as const; }));
  const writes: Statement[] = [...leagues.values()].map((l) => ({
    text: `INSERT INTO leagues (id,country,name,provider,provider_key,priority,top10) VALUES ($1,$2,$3,'stake',$4,950,$5) ON CONFLICT (id) DO NOTHING`,
    params: [l.id, l.country, l.name, l.providerKey, false],
  }));
  for (let i = 0; i < writes.length; i += 40) await atomic(writes.slice(i, i + 40));
  const { persistFixtures } = await import('./fixtures');
  await persistFixtures(missing.map(stakeFixture));
  return missing.length;
}

/** What /cote shows: the latest import and how much of it is still usable. */
export async function importStatus() {
  const r = await one<{ n: number | string; fresh: number | string; captured: string | Date | null; first: string | Date | null; last: string | Date | null }>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN captured_at >= $1 AND kickoff_utc > $2 THEN 1 ELSE 0 END) AS fresh, MAX(captured_at) AS captured, MIN(kickoff_utc) AS first, MAX(kickoff_utc) AS last
       FROM imported_odds WHERE source='stake'`, [new Date(Date.now() - maxAgeMs()).toISOString(), new Date().toISOString()]).catch(() => null);
  return { matches: Number(r?.n ?? 0), usable: Number(r?.fresh ?? 0), capturedAt: r?.captured ? iso(r.captured) : null, first: r?.first ? iso(r.first) : null, last: r?.last ? iso(r.last) : null, maxAgeHours: Math.round(maxAgeMs() / 3600_000) };
}

// ── Live scores from a Stake export (02.11) ───────────────────────────────────
// `export_matches.py --state live` lists the matches in play with their score. Only Stake-only fixtures use it (ESPN
// keeps its own results): the score and minute are shown while the match runs; a match Stake marks as ended gets its
// final score, which the settlement then uses. Nothing here is guessed: no status, no update.
// Stake writes both "2nd half" and "SecondHalf" (seen 02.11), so the end of a match may come as "Ended" or "FullTime".
const ENDED = /ended|finished|full ?time|^ft$|after ?(extra|overtime|penalt)|^aet$|^ap$|penalties/i;
export type LiveScore = { sourceId: string; home: number; away: number; ended: boolean; clock: string | null; status: string };

export function parseStakeLive(raw: unknown): LiveScore[] {
  const root = obj(raw);
  const out: LiveScore[] = [];
  for (const m of arr(obj(root.data).matches ?? root.matches).map(obj)) {
    const es = obj(m.event_status);
    const h = Number(es.homeScore), a = Number(es.awayScore), status = str(es.matchStatus);
    if (!str(m.source_id) || !status || !Number.isInteger(h) || !Number.isInteger(a) || es.homeScore === null || es.awayScore === null) continue;
    const t = obj(es.clock).matchTime;
    out.push({ sourceId: str(m.source_id), home: h, away: a, ended: ENDED.test(status.trim()), clock: typeof t === 'string' && t ? `${t.split(':')[0]}'` : null, status });
  }
  return out;
}

export async function importStakeLive(raw: unknown) {
  const scores = parseStakeLive(raw);
  let live = 0, ended = 0;
  const writes: Statement[] = [];
  for (const s of scores) {
    const id = `stk:${s.sourceId}`;
    if (s.ended) {
      writes.push({ text: `UPDATE fixtures SET status='post', home_score=$2, away_score=$3, live_clock=NULL, source_observed_at=$4, results_checked_at=$4 WHERE id=$1 AND provider='stake' AND status<>'post'`, params: [id, s.home, s.away, new Date().toISOString()] });
      ended++;
    } else {
      writes.push({ text: `UPDATE fixtures SET status='in', home_score=$2, away_score=$3, live_clock=$4, source_observed_at=$5 WHERE id=$1 AND provider='stake' AND status IN ('pre','in')`, params: [id, s.home, s.away, s.clock ?? s.status.slice(0, 20), new Date().toISOString()] });
      live++;
    }
  }
  for (let i = 0; i < writes.length; i += 40) await atomic(writes.slice(i, i + 40));
  const closed = obj(obj(raw).meta).complete === true && scores.length ? await closeVanishedLive(new Set(scores.map((s) => `stk:${s.sourceId}`))) : 0;
  return { live: true, matches: scores.length, inPlay: live, ended, closed };
}

/** Stake drops a finished match from its live list, so ENDED is never seen. A match that was last seen in play at minute 85 or
 *  later, is no longer listed by a COMPLETE export, last updated 10+ minutes ago and started 105+ minutes ago is settled with its last score. */
export const AUTO_CLOSE_MINUTE = 85;
async function closeVanishedLive(listed: Set<string>) {
  const rows = await many<{ id: string; live_clock: string | null }>(
    `SELECT id, live_clock FROM fixtures WHERE provider='stake' AND status='in' AND home_score IS NOT NULL AND away_score IS NOT NULL AND kickoff_utc <= $1 AND source_observed_at <= $2`,
    [new Date(Date.now() - 105 * 60_000).toISOString(), new Date(Date.now() - 10 * 60_000).toISOString()]);
  const ids = rows.filter((r) => !listed.has(r.id) && Number(/^(\d+)/.exec(r.live_clock ?? '')?.[1] ?? 0) >= AUTO_CLOSE_MINUTE).map((r) => r.id);
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 40) await atomic(ids.slice(i, i + 40).map((id) => ({ text: `UPDATE fixtures SET status='post', live_clock=NULL, source_observed_at=$2, results_checked_at=$2 WHERE id=$1 AND provider='stake' AND status='in'`, params: [id, now] })));
  return ids.length;
}
