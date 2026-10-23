import { many } from './db';
import { finalAgentPicksCte } from './final-agent-picks';

/**
 * "Training" without fine-tuning: every agent pick is settled after the match (WON/LOST/VOID),
 * and the agent's own verified record is fed back into its next analyses so it can recalibrate.
 */
export type TrackRecord = {
  agentId: string;
  decided: number;
  won: number;
  hitRate: number;
  avgOdds: number;
  avgEstimated: number | null;
  buckets: Array<{ label: string; n: number; won: number }>;
};

export async function agentTrackRecord(agentId: string, limit = 80): Promise<TrackRecord | null> {
  const rows = await many<{ outcome: 'WON' | 'LOST'; odds: string | null; estimated_probability: string | null }>(
    `${finalAgentPicksCte()}
     SELECT p.outcome,p.odds,p.estimated_probability FROM final_picks p JOIN fixtures f ON f.id=p.fixture_id
     WHERE p.agent_id=$1 AND p.decision='BET_CANDIDATE' AND p.outcome IN ('WON','LOST')
     ORDER BY f.kickoff_utc DESC,p.id DESC LIMIT $2`,
    [agentId, limit],
  );
  return recordOf(agentId, rows);
}

function recordOf(agentId: string, rows: Array<{ outcome: string; odds: string | null; estimated_probability: string | null }>): TrackRecord | null {
  if (!rows.length) return null;
  const won = rows.filter((r) => r.outcome === 'WON').length;
  const priced = rows.filter((r) => r.odds !== null);
  const est = rows.filter((r) => r.estimated_probability !== null);
  const bucket = (label: string, lo: number, hi: number) => {
    const b = priced.filter((r) => Number(r.odds) > lo && Number(r.odds) <= hi);
    return { label, n: b.length, won: b.filter((r) => r.outcome === 'WON').length };
  };
  return {
    agentId,
    decided: rows.length,
    won,
    hitRate: won / rows.length,
    avgOdds: priced.length ? priced.reduce((s, r) => s + Number(r.odds), 0) / priced.length : 0,
    avgEstimated: est.length ? est.reduce((s, r) => s + Number(r.estimated_probability), 0) / est.length : null,
    buckets: [bucket('≤ 1.50', 0, 1.5), bucket('1.51–2.00', 1.5, 2), bucket('> 2.00', 2, 1000)].filter((b) => b.n > 0),
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Romanian feedback block for the agent's prompt; null while there is too little evidence. */
export function trackRecordText(r: TrackRecord | null, minDecided = 5): string | null {
  if (!r || r.decided < minDecided) return null;
  const parts = [`ISTORICUL TĂU VERIFICAT (ultimele ${r.decided} selecții decise): ${r.won} câștigate (${pct(r.hitRate)}), cotă medie ${r.avgOdds.toFixed(2)}.`];
  if (r.buckets.length) parts.push(`Pe intervale de cotă: ${r.buckets.map((b) => `${b.label}: ${b.won}/${b.n}`).join('; ')}.`);
  if (r.avgEstimated !== null) {
    const gap = r.avgEstimated - r.hitRate;
    parts.push(gap > 0.05
      ? `Ai estimat în medie ${pct(r.avgEstimated)}, dar ai nimerit ${pct(r.hitRate)}: ai fost prea optimist. Scade-ți estimările și alege selecții mai sigure sau NO_BET.`
      : gap < -0.05
        ? `Ai estimat în medie ${pct(r.avgEstimated)} și ai nimerit ${pct(r.hitRate)}: ai fost prudent și corect calibrat; păstrează disciplina.`
        : `Estimările tale (${pct(r.avgEstimated)}) sunt aproape de rezultate (${pct(r.hitRate)}).`);
  }
  const weak = r.buckets.find((b) => b.n >= 4 && b.won / b.n < 0.45);
  if (weak) parts.push(`Atenție: pe cote ${weak.label} ai doar ${weak.won}/${weak.n}; evită acest interval.`);
  return parts.join(' ');
}

/** Display records cover the same scope/month as statistics, with no silent last-200 cap.
 * The separate prompt feedback function keeps its existing bounded sample. */
export async function allTrackRecords(agentIds: string[], options: { userId?: string; month?: string } = {}) {
  const rows = await many<{ agent_id: string; outcome: string; odds: string | null; estimated_probability: string | null }>(
    `${finalAgentPicksCte(true)}
     SELECT p.agent_id,p.outcome,p.odds,p.estimated_probability
     FROM final_picks p JOIN fixtures f ON f.id=p.fixture_id
     WHERE p.agent_id=ANY($2) AND p.decision='BET_CANDIDATE' AND p.outcome IN ('WON','LOST')
       AND ($3='all' OR to_char(f.kickoff_utc AT TIME ZONE 'Europe/Bucharest','YYYY-MM')=$3)
     ORDER BY p.agent_id,f.kickoff_utc DESC,p.id DESC`, [options.userId ?? null, agentIds, options.month ?? 'all']);
  return agentIds.map((id) => ({ id, record: recordOf(id, rows.filter((r) => r.agent_id === id)) }));
}
