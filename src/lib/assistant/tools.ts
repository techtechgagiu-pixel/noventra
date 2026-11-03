import { many, one } from '../db';
import { agentHistory, agentStats, currentMonth } from '../agent-stats';
import { listTickets, ticketDetail } from '../views';
import { matchList, matchMarkets } from '../catalog';
import { importStatus } from '../sports/imported-prices';
import { AGENT_META } from '../format';

/**
 * Read-only tools of the site assistant (03.11). Each one wraps a query the site already uses for its own pages, so
 * the assistant sees exactly what a signed-in user sees (all tickets with their creators, e-mails masked for others)
 * and nothing it could change. Outputs are trimmed: the model gets facts, not whole pages.
 */
export type ToolCtx = { userId: string; owner: boolean };
type Tool = { name: string; description: string; parameters: Record<string, unknown>; run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown> };

const r2 = (x: unknown) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x);
const pct = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 1000) / 10);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const month = (v: unknown) => (v === 'all' || /^\d{4}-(0[1-9]|1[0-2])$/.test(str(v)) ? str(v) : currentMonth());
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const TOOLS: Tool[] = [
  {
    name: 'rezumat_platforma',
    description: 'Cifrele generale: bilete câștigate/pierdute/în așteptare, rata de câștig pe intervale de cotă finală, cel mai mare bilet câștigat, starea ofertei Stake.',
    parameters: { type: 'object', properties: {} },
    run: async () => {
      const buckets = await many<{ b: string; n: number; won: number }>(`SELECT CASE WHEN actual_odds < 2 THEN 'sub 2' WHEN actual_odds < 3 THEN '2-3' WHEN actual_odds < 5 THEN '3-5' WHEN actual_odds < 8 THEN '5-8' WHEN actual_odds < 15 THEN '8-15' WHEN actual_odds < 30 THEN '15-30' ELSE 'peste 30' END AS b,
        count(*) AS n, SUM(CASE WHEN outcome_status='WON' THEN 1 ELSE 0 END) AS won FROM tickets WHERE generation_status='COMPLETED' AND hidden_at IS NULL AND outcome_status IN ('WON','LOST') GROUP BY 1`);
      const totals = await many<{ outcome_status: string; n: number }>(`SELECT outcome_status, count(*) AS n FROM tickets WHERE generation_status='COMPLETED' AND hidden_at IS NULL GROUP BY 1`);
      const best = await one<{ id: string; actual_odds: number; leg_count: number }>(`SELECT id, CAST(actual_odds AS DOUBLE PRECISION) AS actual_odds, leg_count FROM tickets WHERE outcome_status='WON' AND hidden_at IS NULL ORDER BY actual_odds DESC LIMIT 1`);
      return { bilete: Object.fromEntries(totals.map((t) => [t.outcome_status, Number(t.n)])), pe_cote: buckets.map((b) => ({ cota: b.b, bilete: Number(b.n), castigate: Number(b.won), procent: Math.round((Number(b.won) / Number(b.n)) * 100) })),
        cel_mai_mare_castigat: best ? { id: best.id, cota: r2(Number(best.actual_odds)), meciuri: best.leg_count } : null, oferta_stake: await importStatus().catch(() => null) };
    },
  },
  {
    name: 'statistici_agenti',
    description: 'Clasamentul agenților AI: pronosticuri câștigate/pierdute, rata, cota medie, rol, limite, dacă e în antrenament și ce tipuri de pariu are închise.',
    parameters: { type: 'object', properties: { sport: { type: 'string', enum: ['football', 'cs'] }, luna: { type: 'string', description: 'YYYY-MM sau all; implicit luna curentă' }, doar_ale_mele: { type: 'boolean' } } },
    run: async (a, ctx) => {
      const s = await agentStats(ctx.userId, false, month(a.luna), a.doar_ale_mele ? 'mine' : 'all', a.sport === 'cs' ? 'cs' : 'football');
      return { luna: s.month, sport: s.sport, agenti: s.agents.filter((x) => !x.editorial).sort((x, y) => (y.hitRate ?? -1) - (x.hitRate ?? -1)).map((x) => ({
        id: x.id, nume: AGENT_META[x.id]?.name ?? x.name, rol: x.title, model: x.ownModel, castigate: x.won, pierdute: x.lost, in_asteptare: x.pending, no_bet: x.noBet, rata_pct: pct(x.hitRate), cota_medie: r2(x.avgOdds),
        cariera: x.career, cota_max: x.character.maxOdds, prob_min: x.character.minProbability,
        antrenament: x.coaching ? { nivel: x.coaching.level, rata_pct: pct(x.coaching.hitRate), echipa_pct: pct(x.coaching.teamRate), inchise: x.coaching.blocked.map((b) => `${b.label} (${b.won}/${b.n})`) } : null,
        ...(ctx.owner ? { cost_luna_usd: r2(x.usage.costMonth) } : {}),
      })) };
    },
  },
  {
    name: 'istoric_agent',
    description: 'Ultimele pronosticuri ale unui agent (meci, pronostic, cotă, rezultat).',
    parameters: { type: 'object', required: ['agent_id'], properties: { agent_id: { type: 'string' }, luna: { type: 'string' }, sport: { type: 'string', enum: ['football', 'cs'] }, limita: { type: 'number' } } },
    run: async (a, ctx) => {
      const h = await agentHistory(ctx.userId, str(a.agent_id), month(a.luna), 'all', a.sport === 'cs' ? 'cs' : 'football');
      return Array.isArray(h) ? h.slice(0, Math.min(40, num(a.limita, 25))) : h;
    },
  },
  {
    name: 'bilete',
    description: 'Biletele create (ale tuturor, cu autorul), cu filtre: rezultat, cotă, ale mele. Fiecare bilet vine cu selecțiile, cotele și scorurile.',
    parameters: { type: 'object', properties: { rezultat: { type: 'string', enum: ['WON', 'LOST', 'PENDING', 'INCOMPLETE', 'oricare'] }, doar_ale_mele: { type: 'boolean' }, cota_min: { type: 'number' }, cota_max: { type: 'number' }, sortare: { type: 'string', enum: ['recente', 'cota_mare', 'cota_mica'] }, limita: { type: 'number' } } },
    run: async (a, ctx) => {
      let rows = (await listTickets(ctx.userId)) as Array<Record<string, unknown> & { creator?: { label?: string; mine?: boolean } }>;
      const want = str(a.rezultat);
      if (want === 'INCOMPLETE') rows = rows.filter((t) => t.generation_status === 'INCOMPLETE');
      else if (want && want !== 'oricare') rows = rows.filter((t) => t.outcome_status === want && t.generation_status === 'COMPLETED');
      if (a.doar_ale_mele) rows = rows.filter((t) => t.creator?.mine);
      const odds = (t: Record<string, unknown>) => Number(t.actual_odds ?? 0);
      if (typeof a.cota_min === 'number') rows = rows.filter((t) => odds(t) >= (a.cota_min as number));
      if (typeof a.cota_max === 'number') rows = rows.filter((t) => odds(t) <= (a.cota_max as number));
      if (a.sortare === 'cota_mare') rows.sort((x, y) => odds(y) - odds(x)); else if (a.sortare === 'cota_mica') rows.sort((x, y) => odds(x) - odds(y));
      return { total: rows.length, bilete: rows.slice(0, Math.min(15, num(a.limita, 8))).map((t) => ({
        id: t.id, creat: t.created_at, autor: t.creator?.label, al_meu: t.creator?.mine, cota: r2(odds(t)), tinta: t.target_odds, meciuri: t.leg_count, stare: t.generation_status, rezultat: t.outcome_status,
        selectii: (Array.isArray(t.selections) ? t.selections : []).map((s: Record<string, unknown>) => ({ meci: s.match, pronostic: s.label, cota: s.odds, rezultat: s.outcome, scor: s.home_score !== null && s.home_score !== undefined ? `${s.home_score}-${s.away_score}` : null, start: s.kickoff })),
      })) };
    },
  },
  {
    name: 'bilet',
    description: 'Detaliile unui bilet după id: selecții, voturi, probabilități, motivul construcției.',
    parameters: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    run: async (a, ctx) => {
      const d = await ticketDetail(ctx.userId, str(a.id)) as Record<string, unknown> | null;
      if (!d) return { eroare: 'Biletul nu există.' };
      return { bilet: { id: d.id, titlu: d.title, cota: d.actualOdds, tinta: d.target, meciuri: d.legCount, rezultat: d.outcomeStatus, stare: d.generationStatus, autor: (d.creator as { label?: string } | undefined)?.label, motiv: (d.summary as Record<string, unknown> | undefined)?.reason },
        selectii: (Array.isArray(d.selections) ? d.selections : []).map((s: Record<string, unknown>) => ({ meci: (s.snapshot as Record<string, unknown> | undefined)?.match, pronostic: s.market_label, cota: s.odds, voturi: s.votes_for, probabilitate: s.model_probability, risc: s.risk, rezultat: s.outcome, scor: s.home_score !== null && s.home_score !== undefined ? `${s.home_score}-${s.away_score}` : null })) };
    },
  },
  {
    name: 'meciuri',
    description: 'Meciurile din ofertă (cote Stake 1/X/2) și ultima analiză a agenților pentru fiecare. Caută după echipă sau ligă; doar meciurile care încep în următoarele N ore.',
    parameters: { type: 'object', properties: { cauta: { type: 'string', description: 'echipă sau ligă' }, ore: { type: 'number', description: 'implicit 48' }, doar_analizate: { type: 'boolean' }, limita: { type: 'number' } } },
    run: async (a, ctx) => {
      const { rows } = await matchList(ctx.userId, 'all');
      const q = norm(str(a.cauta));
      const until = Date.now() + num(a.ore, 48) * 3600_000;
      const out = rows.filter((m) => (!q || norm(`${m.home} ${m.away} ${m.league} ${m.country}`).includes(q)) && (q ? true : Date.parse(m.kickoff) <= until && Date.parse(m.kickoff) >= Date.now() - 3 * 3600_000) && (!a.doar_analizate || m.analysis));
      return { total: out.length, meciuri: out.slice(0, Math.min(30, num(a.limita, 15))).map((m) => ({ id: m.id, meci: `${m.home} – ${m.away}`, liga: `${m.country} · ${m.league}`, start: m.kickoff, stare: m.status, scor: m.score,
        cote: m.odds ? { '1': m.odds.home, X: m.odds.draw, '2': m.odds.away, piete: m.odds.markets, casa: m.odds.bookmaker } : null,
        analiza: m.analysis ? { verdict: m.analysis.outcome, pronostic: m.analysis.label, cota: m.analysis.odds, voturi: m.analysis.votes, pe_bilet: m.analysis.onTicket, rezultat: m.analysis.selectionOutcome } : null })) };
    },
  },
  {
    name: 'piete_meci',
    description: 'Toate piețele și cotele salvate pentru un meci (după id din „meciuri”).',
    parameters: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    run: async (a) => {
      const m = await matchMarkets(str(a.id));
      return { casa: m.bookmaker, observat: m.observedAt, piete: m.markets.slice(0, 60).map((x) => ({ cheie: x.key, pronostic: x.label, cota: x.odds })) };
    },
  },
];

export const toolSpecs = () => TOOLS.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));

export async function runTool(name: string, rawArgs: string, ctx: ToolCtx) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { eroare: `Unealta ${name} nu există.` };
  let args: Record<string, unknown> = {};
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { return { eroare: 'Argumente invalide.' }; }
  try {
    const out = await tool.run(args, ctx);
    const text = JSON.stringify(out);
    return text.length > 14_000 ? { trunchiat: true, date: JSON.parse(JSON.stringify(out, (_k, v) => (Array.isArray(v) && v.length > 10 ? v.slice(0, 10) : v))) } : out;
  } catch (e) {
    return { eroare: (e as Error).message.slice(0, 200) };
  }
}
