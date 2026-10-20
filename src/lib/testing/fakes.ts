import { setFixtureProviderForTests } from '../sports/fixtures';
import { setHistoryProviderForTests } from '../scout/history';
import { setAiTransportForTests, type ModelRef, type CallInput } from '../ai/router';
import type { Fixture, HistoricalMatch } from '../sports/types';

// DEMO-only fakes for automated tests. Activated solely when BETMIND_TEST_MODE=1 on localhost.
/** DEMO fixtures (synthetic, labelled). Kickoffs are in the future relative to real time. */
export function demoFixtures(n: number, oddsFor = (i: number) => ({ home: 1.6 + (i % 5) * 0.1, draw: 3.8, away: 5.0, dc: 1.2 + (i % 4) * 0.05 })): Fixture[] {
  const base = Date.now() + 6 * 3600_000;
  return Array.from({ length: n }, (_, i) => {
    const o = oddsFor(i);
    return {
      id: `demo:${i}`, provider: 'demo', providerId: String(i), leagueId: ['ENG1', 'ESP1', 'ITA1', 'GER1'][i % 4], leagueKey: 'eng.1', leagueName: 'DEMO League', country: 'DEMO',
      home: `DEMO Home ${i}`, away: `DEMO Away ${i}`, kickoff: new Date(base + i * 3600_000).toISOString(), status: 'pre',
      odds: { bookmaker: 'DEMO Book', source: 'DEMO', observedAt: new Date().toISOString(), providerUpdatedAt: null, markets: [
        { key: '1X2:HOME', label: `DEMO Home ${i} câștigă (1)`, marketType: '1X2', odds: o.home }, { key: '1X2:DRAW', label: 'Egal (X)', marketType: '1X2', odds: o.draw }, { key: '1X2:AWAY', label: `DEMO Away ${i} câștigă (2)`, marketType: '1X2', odds: o.away },
        { key: 'DC:1X', label: `DEMO Home ${i} sau egal (1X)`, marketType: 'DOUBLE_CHANCE', odds: o.dc },
      ] }, fetchedAt: new Date().toISOString(),
    } satisfies Fixture;
  });
}
const history = (n: number, strong: boolean): HistoricalMatch[] => Array.from({ length: n }, (_, i) => ({ eventKey: `h${i}`, date: new Date(Date.now() - (i + 1) * 7 * 86400_000).toISOString(), competition: 'DEMO', venue: i % 2 ? 'away' : 'home', opponent: `Opp ${i}`, goalsFor: strong ? 3 : 0, goalsAgainst: strong ? 0 : 2, result: strong ? 'W' : 'L', shots: 12, shotsOnTarget: strong ? 8 : 2, opponentShots: 8, opponentShotsOnTarget: strong ? 1 : 6, possession: 55, redCardsFor: 0, redCardsAgainst: 0, penaltyGoalsFor: 0, penaltyGoalsAgainst: 0, ownGoalsFor: 0, ownGoalsAgainst: 0, deflectedGoalsFor: 0, earlyRedCard: false, xg: null, source: 'DEMO' }));

export type FakeAi = { calls: Array<{ ref: ModelRef; stage: string }>; pick: (fixtureId: string, agent: string) => string | null; failNext?: number };
export function installFakes(fixtures: Fixture[], ai: FakeAi) {
  setFixtureProviderForTests(async (_l, days) => ({ fixtures: fixtures.filter((f) => days.includes(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(f.kickoff)))), errors: [] }));
  setHistoryProviderForTests((_f, side) => history(8, side === 'home'));
  setAiTransportForTests(async (ref: ModelRef, input: CallInput) => {
    const agent = /Ești ([A-ZȘ]+)/.exec(input.system)?.[1]?.toLowerCase() ?? 'scout';
    const ids = [...input.user.matchAll(/"fixtureId":"([^"]+)"/g)].map((m) => m[1]);
    const unique = [...new Set(ids)];
    ai.calls.push({ ref, stage: input.user.startsWith('Runda') ? 'DEBATE' : agent === 'scout' ? 'SCOUT' : 'INITIAL' });
    if (ai.failNext && ai.failNext > 0) { ai.failNext--; const { RateLimitError } = await import('../ai/router'); throw new RateLimitError('groq', 6 * 3600_000, true); }
    const usage = { inputTokens: 100, outputTokens: 50, resolvedModel: ref.model };
    if (agent === 'scout') return { text: JSON.stringify({ fixtures: unique.map((id) => ({ fixtureId: id, summary: 'DEMO rezumat', keyObservations: ['DEMO'] })) }), ...usage };
    const items = unique.map((id) => { const k = ai.pick(id, agent); return { fixtureId: id, decision: k ? 'BET_CANDIDATE' : 'NO_BET', marketKey: k, estimatedProbability: k ? 0.8 : null, confidence: 70, risk: 'LOW', evidence: ['DEMO'], counterarguments: [], missingData: [], failureReasons: ['DEMO'], rationale: 'DEMO', changed: false, objection: '', response: '' }; });
    return { text: JSON.stringify(input.user.startsWith('Runda') ? { revisions: items } : { predictions: items }), ...usage };
  });
}
export function clearFakes() { setFixtureProviderForTests(null); setHistoryProviderForTests(null); setAiTransportForTests(null); }
