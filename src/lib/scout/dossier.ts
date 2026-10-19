import type { HistoricalMatch } from '../sports/types';

export type AnomalyClass = 'VERIFIED EVENT' | 'POSSIBLE FORTUITOUS INFLUENCE' | 'INSUFFICIENT EVIDENCE';
export type Anomaly = { team: string; match: string; date: string; classification: AnomalyClass; observation: string; evidence: string };

export type TeamDossier = {
  team: string;
  sample: number;
  record: { w: number; d: number; l: number };
  goalsForPerMatch: number | null;
  goalsAgainstPerMatch: number | null;
  shotsOnTargetFor: number | null;
  shotsOnTargetAgainst: number | null;
  finishingDelta: number | null; // goals - SoT*conversion, summed: >0 finishing above baseline
  resultsVsPerformance: string;
  recent: Array<{ date: string; venue: string; opponent: string; score: string; result: string; sot: string; notes: string[] }>;
  anomalies: Anomaly[];
};

export type ScoutDossier = {
  mode: 'statistics';
  modeMessage: string;
  fixture: { home: string; away: string; kickoff: string; league: string };
  home: TeamDossier;
  away: TeamDossier;
  missing: string[];
  sources: string[];
  limitations: string[];
};

const CONVERSION = 0.31;
const avg = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; };

export function teamDossier(team: string, matches: HistoricalMatch[]): TeamDossier {
  const anomalies: Anomaly[] = [];
  const recent = matches.map((m) => {
    const notes: string[] = [];
    const label = `${m.venue === 'home' ? 'vs' : '@'} ${m.opponent}`;
    const base = { team, match: label, date: m.date };
    if (m.ownGoalsFor) { anomalies.push({ ...base, classification: 'VERIFIED EVENT', observation: `${m.ownGoalsFor} autogol(uri) în favoarea echipei`, evidence: 'Eveniment marcat ownGoal în sursă' }); notes.push('autogol în favoare'); }
    if (m.penaltyGoalsFor) { anomalies.push({ ...base, classification: 'VERIFIED EVENT', observation: `${m.penaltyGoalsFor} gol(uri) din penalty`, evidence: 'Eveniment marcat penaltyKick în sursă' }); notes.push('gol din penalty'); }
    if (m.deflectedGoalsFor) { anomalies.push({ ...base, classification: 'VERIFIED EVENT', observation: `${m.deflectedGoalsFor} gol(uri) descris(e) ca deviat(e)`, evidence: 'Descrierea textuală a golului din sursă menționează devierea' }); notes.push('gol deviat'); }
    if (m.earlyRedCard) { anomalies.push({ ...base, classification: 'VERIFIED EVENT', observation: 'Cartonaș roșu înainte de minutul 30', evidence: 'Eveniment redCard cu minutul din sursă' }); notes.push('roșu devreme'); }
    if (m.shotsOnTarget !== null && m.opponentShotsOnTarget !== null) {
      const sotDiff = m.shotsOnTarget - m.opponentShotsOnTarget;
      if (m.result === 'W' && sotDiff <= -3) { anomalies.push({ ...base, classification: 'POSSIBLE FORTUITOUS INFLUENCE', observation: `Victorie deși adversarul a avut cu ${-sotDiff} șuturi pe poartă mai mult`, evidence: `Șuturi pe poartă ${m.shotsOnTarget}–${m.opponentShotsOnTarget}` }); notes.push('victorie cu mai puține ocazii'); }
      if (m.result === 'L' && sotDiff >= 3) { anomalies.push({ ...base, classification: 'POSSIBLE FORTUITOUS INFLUENCE', observation: `Înfrângere deși a avut cu ${sotDiff} șuturi pe poartă mai mult`, evidence: `Șuturi pe poartă ${m.shotsOnTarget}–${m.opponentShotsOnTarget}` }); notes.push('înfrângere cu mai multe ocazii'); }
      const over = m.goalsFor - m.shotsOnTarget * CONVERSION;
      if (m.goalsFor >= 3 && over >= 1.5) anomalies.push({ ...base, classification: 'POSSIBLE FORTUITOUS INFLUENCE', observation: `Eficiență de finalizare neobișnuit de mare (${m.goalsFor} goluri din ${m.shotsOnTarget} șuturi pe poartă)`, evidence: 'Comparație cu rata tipică de conversie; nu este xG' });
    } else {
      anomalies.push({ ...base, classification: 'INSUFFICIENT EVIDENCE', observation: 'Statisticile de șuturi lipsesc pentru acest meci', evidence: 'Câmpuri absente în sursă' });
    }
    return { date: m.date, venue: m.venue === 'home' ? 'acasă' : 'deplasare', opponent: m.opponent, score: `${m.goalsFor}-${m.goalsAgainst}`, result: m.result, sot: m.shotsOnTarget !== null ? `${m.shotsOnTarget}-${m.opponentShotsOnTarget}` : 'n/d', notes };
  });
  const withShots = matches.filter((m) => m.shotsOnTarget !== null && m.opponentShotsOnTarget !== null);
  const finishingDelta = withShots.length ? Math.round(withShots.reduce((s, m) => s + (m.goalsFor - m.shotsOnTarget! * CONVERSION), 0) * 100) / 100 : null;
  const goalDiff = matches.reduce((s, m) => s + m.goalsFor - m.goalsAgainst, 0);
  const sotDiff = withShots.reduce((s, m) => s + (m.shotsOnTarget! - m.opponentShotsOnTarget!) * CONVERSION, 0);
  let resultsVsPerformance = 'Date insuficiente pentru comparația rezultate–performanță.';
  if (withShots.length >= 3) {
    const gap = goalDiff - sotDiff;
    resultsVsPerformance = Math.abs(gap) < 2
      ? `Rezultatele par susținute de performanța de bază (golaveraj ${goalDiff >= 0 ? '+' : ''}${goalDiff} vs. ${sotDiff >= 0 ? '+' : ''}${sotDiff.toFixed(1)} estimat din șuturi pe poartă).`
      : gap > 0
        ? `Rezultatele sunt peste performanța de bază (golaveraj ${goalDiff >= 0 ? '+' : ''}${goalDiff} vs. ${sotDiff >= 0 ? '+' : ''}${sotDiff.toFixed(1)}); posibilă supraperformanță la finalizare sau în apărare.`
        : `Rezultatele sunt sub performanța de bază (golaveraj ${goalDiff >= 0 ? '+' : ''}${goalDiff} vs. ${sotDiff >= 0 ? '+' : ''}${sotDiff.toFixed(1)}); echipa a creat mai mult decât arată scorurile.`;
  }
  return {
    team, sample: matches.length,
    record: { w: matches.filter((m) => m.result === 'W').length, d: matches.filter((m) => m.result === 'D').length, l: matches.filter((m) => m.result === 'L').length },
    goalsForPerMatch: avg(matches.map((m) => m.goalsFor)), goalsAgainstPerMatch: avg(matches.map((m) => m.goalsAgainst)),
    shotsOnTargetFor: avg(matches.map((m) => m.shotsOnTarget)), shotsOnTargetAgainst: avg(matches.map((m) => m.opponentShotsOnTarget)),
    finishingDelta, resultsVsPerformance, recent, anomalies,
  };
}

export function buildDossier(input: { home: string; away: string; kickoff: string; league: string; homeMatches: HistoricalMatch[]; awayMatches: HistoricalMatch[]; missing: string[] }): ScoutDossier {
  return {
    mode: 'statistics',
    modeMessage: 'Analiza video nu este disponibilă. Cercetarea folosește date statistice și evenimente istorice.',
    fixture: { home: input.home, away: input.away, kickoff: input.kickoff, league: input.league },
    home: teamDossier(input.home, input.homeMatches),
    away: teamDossier(input.away, input.awayMatches),
    missing: [...input.missing, 'xG nu este publicat de sursă — câmp lipsă, nu zero.', 'Accidentările, suspendările și primul 11 nu sunt confirmate în această sursă.'],
    sources: ['ESPN · program sezon echipe', 'ESPN · rezumate meciuri încheiate (statistici și evenimente)'],
    limitations: ['„Norocos” înseamnă doar o observație statistică, nu o dovadă.', 'Meciurile sunt din campionatul curent, înaintea orei de start (fără date din viitor).'],
  };
}
