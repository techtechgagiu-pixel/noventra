import { decidedPicks } from './decided-picks';
import { sameModel } from './calibration';

/**
 * Coaching for the agents that win least ("antrenament", user request 28.10): no fine-tuning, only rules taken from
 * each agent's own settled picks.
 *
 * Every 30 minutes the last RECENT decided picks of each agent (its current model, saved before kickoff) are compared
 * with the team. An agent clearly below the team gets stricter character limits, enforced in code exactly like its
 * normal limits: a higher minimum probability, a lower maximum odds and a calmer temperature. Bet families where it
 * keeps losing (e.g. handicap, total goals) are closed to it: such a vote is not counted. The prompt tells it why,
 * with its own numbers. Because the window rolls, an agent that improves leaves coaching on its own.
 */
export type CoachingFamily = { family: string; label: string; won: number; n: number };
export type Coaching = {
  agentId: string;
  level: 1 | 2;
  n: number; won: number; hitRate: number; teamRate: number;
  minProbability: number; maxOdds: number; temperature: number;
  blocked: CoachingFamily[];
  watch: CoachingFamily[];
  highOdds: { won: number; n: number } | null;
};
type AgentLimits = { id: string; maxOdds: number; minProbability: number; temperature: number };
type Pick = { family: string; odds: number | null; won: boolean };

export const RECENT = 150;
export const MIN_SAMPLE = 30;
const FAMILY_MIN = 6;
const TTL_MS = 30 * 60_000;

const FAMILY_RO: Record<string, string> = {
  AH: 'handicap asiatic', TOTAL: 'total goluri peste', BTTS: 'ambele marchează', DC: 'șansă dublă', CS: 'echipa (nu) primește gol',
  '1X2': 'rezultat final', TT: 'goluri pe echipă', HTTOT: 'goluri în prima repriză', CORN: 'cornere', TCORN: 'cornere pe echipă',
  WIN2: 'victorie la 2+ goluri', WBH: 'câștigă ambele reprize', HT1X2: 'rezultat la pauză', H21X2: 'rezultat în repriza a doua',
};
export const familyOf = (key: string | null) => (key ?? '').split(':')[0] || '—';
export const familyLabel = (f: string) => FAMILY_RO[f] ?? f;

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Pure: the coaching for one agent, or null when it is in line with the team (or the sample is too small). */
export function coachingOf(agent: AgentLimits, picks: Pick[], teamRate: number): Coaching | null {
  if (picks.length < MIN_SAMPLE || !(teamRate > 0)) return null;
  const won = picks.filter((p) => p.won).length;
  const hitRate = won / picks.length;
  const gap = teamRate - hitRate;
  if (gap < 0.035) return null;
  const level: 1 | 2 = gap >= 0.07 ? 2 : 1;

  const families = new Map<string, { won: number; n: number }>();
  for (const p of picks) { const f = families.get(p.family) ?? { won: 0, n: 0 }; f.n++; if (p.won) f.won++; families.set(p.family, f); }
  const fam = [...families].map(([family, f]) => ({ family, label: familyLabel(family), ...f })).filter((f) => f.n >= FAMILY_MIN);
  // Closed: clearly losing in that family (well under the team and under 55%). Watched: noticeably under the team.
  const blocked = fam.filter((f) => f.won / f.n < Math.min(0.55, teamRate - 0.15)).sort((a, b) => a.won / a.n - b.won / b.n);
  const watch = fam.filter((f) => !blocked.includes(f) && f.won / f.n < teamRate - 0.08).sort((a, b) => a.won / a.n - b.won / b.n);

  // Odds discipline: the weaker the agent, the closer to the safest prices; never above its own character.
  const levelCap = level === 2 ? 1.4 : 1.5;
  const priced = picks.filter((p) => p.odds !== null);
  const high = priced.filter((p) => p.odds! > levelCap);
  const highOdds = high.length ? { won: high.filter((p) => p.won).length, n: high.length } : null;
  const maxOdds = round2(Math.max(1.25, Math.min(agent.maxOdds, levelCap)));
  const minProbability = round2(Math.min(0.82, Math.max(agent.minProbability + (level === 2 ? 0.08 : 0.04), level === 2 ? 0.7 : 0.65)));
  const temperature = Math.min(agent.temperature, level === 2 ? 0.15 : 0.25);
  return { agentId: agent.id, level, n: picks.length, won, hitRate, teamRate, minProbability, maxOdds, temperature, blocked, watch, highOdds };
}

/** The agent as it plays while coached: same character, stricter limits. */
export function coachedAgent<T extends AgentLimits>(agent: T, c: Coaching | null | undefined): T & { blockedFamilies?: string[] } {
  if (!c) return agent;
  return { ...agent, maxOdds: c.maxOdds, minProbability: c.minProbability, temperature: c.temperature, blockedFamilies: c.blocked.map((b) => b.family) };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Romanian coaching block for the agent's prompt. */
export function coachingText(c: Coaching | null | undefined): string | null {
  if (!c) return null;
  const parts = [`ANTRENAMENT ${c.level === 2 ? 'STRICT' : 'DE CORECȚIE'} (din rezultatele tale reale): pe ultimele ${c.n} pronosticuri decise ai ${c.won} câștigate (${pct(c.hitRate)}), iar echipa are ${pct(c.teamRate)}. Până îți revii, joci cu limite mai stricte, verificate automat: cotă maximă ${c.maxOdds.toFixed(2)}, probabilitate minimă ${pct(c.minProbability)}.`];
  if (c.highOdds && c.highOdds.n >= 4) parts.push(`Pe cote peste ${c.maxOdds.toFixed(2)} ai ${c.highOdds.won}/${c.highOdds.n}: de aici veneau pierderile.`);
  if (c.blocked.length) parts.push(`Tipuri de pariu ÎNCHISE pentru tine (votul nu se numără): ${c.blocked.map((b) => `${b.label} (${b.family}, ${b.won}/${b.n})`).join('; ')}.`);
  if (c.watch.length) parts.push(`Atenție sporită la: ${c.watch.map((b) => `${b.label} (${b.won}/${b.n})`).join('; ')}; votează-le doar cu dovezi clare în date.`);
  parts.push('Reguli de antrenament: alege varianta cea mai sigură a aceleiași idei (șansă dublă în loc de victorie, linie mai mică de goluri), nu vota împotriva unui istoric direct sau a unei absențe importante din dosar, iar când ezitești alegi NO_BET. Limitele se relaxează singure când procentul tău revine la nivelul echipei.');
  return parts.join(' ');
}

const g = globalThis as unknown as { __bmCoaching?: { at: number; data: Map<string, Coaching> } };

/** Loads (and caches for 30 minutes) the coaching of every voting agent for its currently assigned model. */
export async function loadCoaching(agents: AgentLimits[], assigned: Map<string, string>, force = false): Promise<Map<string, Coaching>> {
  if (!force && g.__bmCoaching && Date.now() - g.__bmCoaching.at < TTL_MS) return g.__bmCoaching.data;
  const rows = await decidedPicks(force).catch(() => null);
  if (!rows) return g.__bmCoaching?.data ?? new Map();
  const data = coachingForTeam(agents, assigned, rows);
  g.__bmCoaching = { at: Date.now(), data };
  return data;
}

/** Pure: team rate over everyone's recent picks, then each agent against it. Rows must be newest first. */
export function coachingForTeam(agents: AgentLimits[], assigned: Map<string, string>, rows: Array<{ agent_id: string; model_id: string; market_key: string | null; odds: string | number | null; outcome: string }>) {
  const recent = new Map<string, Pick[]>();
  for (const a of agents) {
    const model = assigned.get(a.id);
    if (!model) continue;
    recent.set(a.id, rows.filter((r) => r.agent_id === a.id && sameModel(r.model_id, model)).slice(0, RECENT)
      .map((r) => ({ family: familyOf(r.market_key), odds: r.odds === null ? null : Number(r.odds), won: r.outcome === 'WON' })));
  }
  const pool = [...recent.values()].filter((p) => p.length >= MIN_SAMPLE).flat();
  const teamRate = pool.length ? pool.filter((p) => p.won).length / pool.length : 0;
  const data = new Map<string, Coaching>();
  for (const a of agents) {
    const c = coachingOf(a, recent.get(a.id) ?? [], teamRate);
    if (c) data.set(a.id, c);
  }
  return data;
}

/** Synchronous read for code that cannot await (vote guards); empty until loaded. */
export const cachedCoaching = () => g.__bmCoaching?.data ?? new Map<string, Coaching>();
