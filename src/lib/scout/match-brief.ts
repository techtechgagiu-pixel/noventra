import type { HistoricalMatch } from '../sports/types';
import type { NewsItem } from '../news/google-news';

/**
 * Pre-match research brief (posted by Hanțu in the chat for every selection and given to every agent).
 * Built only from real data: ESPN head-to-head + lineups, the teams' completed matches, the league table and
 * dated headlines. Nothing is inferred: a missing piece is reported as missing.
 */
export type BriefMatch = { date: string; text: string; result?: 'W' | 'D' | 'L' };
export type BriefFlag = { team: string; kind: 'absențe' | 'financiar' | 'formă'; title: string; source: string | null; date: string; link?: string };
export type MatchBrief = {
  /** Counter-Strike brief: recent matches instead of home/away form, Valve standings, rosters as lineups. */
  sport?: 'cs2';
  home: string; away: string;
  h2h: BriefMatch[];
  homeAtHome: BriefMatch[];
  awayAway: BriefMatch[];
  standings: { home: { rank: number | null; points: number | null; played: number | null } | null; away: { rank: number | null; points: number | null; played: number | null } | null };
  lineups: { home: string[] | null; away: string[] | null; formationHome?: string | null; formationAway?: string | null };
  flags: BriefFlag[];
  missing: string[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Last 5 head-to-head meetings before kickoff, from the ESPN summary's season series. */
export function h2hFromSummary(summary: Obj, kickoff: string): BriefMatch[] {
  const series = arr(summary.seasonseries).map(obj).find((s) => s.type === 'head-to-head') ?? arr(summary.seasonseries).map(obj)[0];
  const out: BriefMatch[] = [];
  for (const e of arr(series?.events).map(obj)) {
    const date = str(e.date);
    if (!date || Date.parse(date) >= Date.parse(kickoff) || obj(e.statusType).completed === false) continue;
    const cs = arr(e.competitors).map(obj);
    const h = cs.find((c) => c.homeAway === 'home'), a = cs.find((c) => c.homeAway === 'away');
    if (!h || !a || str(h.score) === '' || str(a.score) === '') continue;
    out.push({ date, text: `${str(obj(h.team).displayName)} ${str(h.score)}-${str(a.score)} ${str(obj(a.team).displayName)}` });
  }
  return out.sort((x, y) => Date.parse(y.date) - Date.parse(x.date)).slice(0, 5);
}

/** Announced starting XI (ESPN publishes it about an hour before kickoff); null while unannounced. */
export function lineupsFromSummary(summary: Obj): MatchBrief['lineups'] {
  const side = (ha: string) => {
    const t = arr(summary.rosters).map(obj).find((r) => r.homeAway === ha);
    const starters = arr(t?.roster).map(obj).filter((p) => p.starter === true).map((p) => str(obj(p.athlete).displayName)).filter(Boolean);
    return { names: starters.length >= 7 ? starters : null, formation: str(t?.formation) || null };
  };
  const h = side('home'), a = side('away');
  return { home: h.names, away: a.names, formationHome: h.formation, formationAway: a.formation };
}

const fmtMatch = (m: HistoricalMatch): BriefMatch => ({ date: m.date, result: m.result, text: `${m.result === 'W' ? 'V' : m.result === 'D' ? 'E' : 'Î'} ${m.goalsFor}-${m.goalsAgainst} vs ${m.opponent}` });

const ABSENCE = /injur|injury|ruled out|sidelined|suspend|ban\b|doubt|absent|miss(es|ing)?\b|accident|indisponibil|absen|suspendat|lipsește|lipsesc|out for/i;
const FINANCE = /financ|debt|wage|salar|unpaid|administration|insolven|points deduct|datori|restan|faliment|sponsor|takeover|transfer ban/i;
const FORM = /crisis|sacked|fired|manager|coach|antrenor|demis|criz|winless|unbeaten|streak|serie/i;

export function newsFlags(home: string, away: string, news: { home: NewsItem[]; away: NewsItem[] } | undefined): BriefFlag[] {
  if (!news) return [];
  const out: BriefFlag[] = [];
  for (const [team, items] of [[home, news.home], [away, news.away]] as const) {
    for (const n of items) {
      const kind = ABSENCE.test(n.title) ? 'absențe' : FINANCE.test(n.title) ? 'financiar' : FORM.test(n.title) ? 'formă' : null;
      if (kind) out.push({ team, kind, title: n.title, source: n.source, date: n.publishedAt, link: n.link });
    }
  }
  return out.slice(0, 8);
}

export function buildMatchBrief(input: {
  home: string; away: string; kickoff: string; summary: Obj | null;
  homeMatches: HistoricalMatch[]; awayMatches: HistoricalMatch[];
  standings: MatchBrief['standings'];
  news?: { home: NewsItem[]; away: NewsItem[] };
}): MatchBrief {
  const before = (m: HistoricalMatch) => Date.parse(m.date) < Date.parse(input.kickoff);
  const recent = (ms: HistoricalMatch[]) => [...ms].filter(before).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const h2h = input.summary ? h2hFromSummary(input.summary, input.kickoff) : [];
  const lineups = input.summary ? lineupsFromSummary(input.summary) : { home: null, away: null };
  const homeAtHome = recent(input.homeMatches).filter((m) => m.venue === 'home').slice(0, 5).map(fmtMatch);
  const awayAway = recent(input.awayMatches).filter((m) => m.venue === 'away').slice(0, 5).map(fmtMatch);
  const flags = newsFlags(input.home, input.away, input.news);
  const missing: string[] = [];
  if (!h2h.length) missing.push('Meciurile directe nu sunt disponibile la sursă.');
  if (homeAtHome.length < 5) missing.push(`${input.home}: ${homeAtHome.length} meciuri acasă găsite (țintă 5).`);
  if (awayAway.length < 5) missing.push(`${input.away}: ${awayAway.length} meciuri în deplasare găsite (țintă 5).`);
  if (!input.standings.home || !input.standings.away) missing.push('Clasamentul nu este disponibil pentru ambele echipe.');
  if (!lineups.home || !lineups.away) missing.push('Echipele de start nu sunt anunțate încă (de obicei apar cu ~1h înainte).');
  if (!flags.some((f) => f.kind === 'absențe')) missing.push('Nicio știre recentă despre accidentări sau suspendări.');
  return { home: input.home, away: input.away, h2h, homeAtHome, awayAway, standings: input.standings, lineups, flags, missing };
}

const pos = (s: MatchBrief['standings']['home']) => (s && s.rank ? `locul ${s.rank}${s.points !== null ? `, ${s.points} pct` : ''}${s.played ? ` din ${s.played} meciuri` : ''}` : 'n/d');
const posCs = (s: MatchBrief['standings']['home']) => (s && s.rank ? `#${s.rank}${s.points !== null ? ` (${s.points} pct)` : ''}` : 'neclasată');
const form = (ms: BriefMatch[]) => (ms.length ? ms.map((m) => m.text).join('; ') : 'n/d');

/** Compact text for agent prompts (the same facts the chat shows). */
export function briefForPrompt(b: MatchBrief | undefined) {
  if (!b) return undefined;
  if (b.sport === 'cs2') return {
    directeUltimele5: form(b.h2h), gazdeUltimele5: form(b.homeAtHome), oaspetiUltimele5: form(b.awayAway),
    clasamentValve: `${b.home}: ${posCs(b.standings.home)} · ${b.away}: ${posCs(b.standings.away)}`,
    rostere: b.lineups.home && b.lineups.away ? `${b.home}: ${b.lineups.home.join(', ')} | ${b.away}: ${b.lineups.away.join(', ')}` : 'n/d',
  };
  return {
    h2hUltimele5: form(b.h2h),
    gazdeleAcasaUltimele5: form(b.homeAtHome),
    oaspetiiDeplasareUltimele5: form(b.awayAway),
    clasament: `${b.home}: ${pos(b.standings.home)} · ${b.away}: ${pos(b.standings.away)}`,
    titulari: b.lineups.home && b.lineups.away ? `${b.home}: ${b.lineups.home.join(', ')} | ${b.away}: ${b.lineups.away.join(', ')}` : 'neanunțați',
    absenteSiProbleme: b.flags.length ? b.flags.map((f) => `${f.team} (${f.kind}): ${f.title}`) : ['nicio știre de absențe/probleme financiare'],
  };
}

/** Chat text, one section per line. */
export function briefForChat(b: MatchBrief) {
  if (b.sport === 'cs2') return [
    `🎮 Counter-Strike 2`,
    `⚔ Ultimele directe: ${form(b.h2h)}`,
    `📈 ${b.home} (ultimele 5): ${form(b.homeAtHome)}`,
    `📈 ${b.away} (ultimele 5): ${form(b.awayAway)}`,
    `🏆 Clasament Valve: ${b.home} ${posCs(b.standings.home)} · ${b.away} ${posCs(b.standings.away)}`,
    `👥 Rostere: ${b.lineups.home && b.lineups.away ? `${b.home}: ${b.lineups.home.join(', ')} · ${b.away}: ${b.lineups.away.join(', ')}` : 'n/d'}`,
  ].join('\n');
  const lines = [
    `⚔ Ultimele 5 directe: ${form(b.h2h)}`,
    `🏠 ${b.home} acasă (ultimele 5): ${form(b.homeAtHome)}`,
    `✈ ${b.away} în deplasare (ultimele 5): ${form(b.awayAway)}`,
    `📊 Clasament: ${b.home} ${pos(b.standings.home)} · ${b.away} ${pos(b.standings.away)}`,
    `👕 Titulari: ${b.lineups.home && b.lineups.away ? `${b.home}${b.lineups.formationHome ? ` (${b.lineups.formationHome})` : ''}: ${b.lineups.home.join(', ')} · ${b.away}${b.lineups.formationAway ? ` (${b.lineups.formationAway})` : ''}: ${b.lineups.away.join(', ')}` : 'neanunțați încă'}`,
    `🩹 Absențe / condiție: ${b.flags.filter((f) => f.kind !== 'financiar').map((f) => `${f.team}: ${f.title}`).join(' · ') || 'nicio știre recentă'}`,
    `💰 Probleme financiare: ${b.flags.filter((f) => f.kind === 'financiar').map((f) => `${f.team}: ${f.title}`).join(' · ') || 'nimic raportat în presă'}`,
  ];
  return lines.join('\n');
}
