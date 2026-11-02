import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { many, one } from '@/lib/db';
import { loadFixtures } from '@/lib/sports/fixtures';
import { setFixtureProviderForTests } from '@/lib/sports/fixtures';
import { ImportError, importStakeExport, importStatus, mergeImported, parseStakeExport, sameImportedMatch, stakeFixture, stakeLeague, stakeOnlyEvents, findImported } from '@/lib/sports/imported-prices';
import { config } from '@/lib/config';
import { pendingStakeResults, ResultError, saveStakeResult } from '@/lib/sports/stake-results';
import { query } from '@/lib/db';
import { localDate } from '@/lib/time';
import { closePool, demoFixtures, resetDb } from './helpers';

beforeEach(resetDb);
afterEach(() => setFixtureProviderForTests(null));
afterAll(closePool);

const fixtureIdNotStake = 'espn:1';
const o = (name: string, odds: number, active = true) => ({ source_id: name, name, odds, active });
const match = (id: string, home: string, away: string, kickoff: string, markets: unknown[]) => ({
  source: 'stake', source_id: id, name: `${home} - ${away}`, starts_at: new Date(kickoff).toUTCString(), status: 'active',
  participants: [{ name: home }, { name: away }], tournament: { name: 'Liga' }, markets,
});
const oneXTwo = (home: string, away: string, h: number, d: number, a: number) => ({ name: '1x2', template: '1x2', group: 'winner', status: 'active', specifiers: '', outcomes: [o(home, h), o('Draw', d), o(away, a)] });
const exportOf = (matches: unknown[], finishedAt = new Date(Date.now() - 3600_000).toISOString()) => ({ data: { matches }, meta: { source: 'stake', market_group: 'main', finished_at: finishedAt } });

describe('Stake export parsing', () => {
  it('maps only unambiguous, settleable markets and keeps prices exactly as exported', () => {
    const at = new Date(Date.now() + 86400_000).toISOString();
    const p = parseStakeExport(exportOf([match('m1', 'Huracan', 'Tigre', at, [
      oneXTwo('Huracan', 'Tigre', 2.11, 2.9, 3.8),
      { name: 'Total', template: 'Total', status: 'active', specifiers: 'total=2.5', outcomes: [o('over 2.5', 2.05), o('under 2.5', 1.72)] },
      { name: 'Both teams to score', status: 'active', outcomes: [o('yes', 1.95), o('no', 1.8)] },
      { name: 'Double chance', status: 'active', outcomes: [o('Huracan or draw', 1.22), o('Huracan or Tigre', 1.35), o('draw or Tigre', 1.6)] },
      { name: '1st half - 1x2', status: 'active', outcomes: [o('Huracan', 2.8), o('Draw', 2), o('Tigre', 4.5)] },
      { name: 'Total', status: 'active', specifiers: 'total=3', outcomes: [o('over 3', 2.4), o('under 3', 1.5)] },
      { name: 'Asian Total', status: 'active', specifiers: 'total=3.5', outcomes: [o('Over 3.5', 3.1), o('Under 3.5', 1.36)] },
      { name: 'Asian Total', status: 'active', specifiers: 'total=2.25', outcomes: [o('Over 2.25', 1.9), o('Under 2.25', 1.9)] },
      { name: 'Asian Handicap', status: 'active', specifiers: 'hcp=-0.5', outcomes: [o('Huracan (-0.5)', 2.12), o('Tigre (0.5)', 1.75)] },
      { name: 'Asian Handicap', status: 'active', specifiers: 'hcp=0', outcomes: [o('Huracan (0)', 1.46), o('Tigre (0)', 2.6)] },
      { name: 'Draw No Bet', status: 'active', outcomes: [o('Huracan', 1.46), o('Tigre', 2.6)] },
    ]), match('m2', 'A Team', 'B Team', at, [{ ...oneXTwo('A Team', 'B Team', 1.5, 4, 6), outcomes: [o('A Team', 1.5), o('Draw', 4, false), o('B Team', 6)] }])]));
    expect(p.events).toHaveLength(1);
    expect([...p.events[0].markets].sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: '1X2:HOME', marketType: '1X2', odds: 2.11 }, { key: '1X2:DRAW', marketType: '1X2', odds: 2.9 }, { key: '1X2:AWAY', marketType: '1X2', odds: 3.8 },
      { key: 'TOTAL:OVER:2.5', marketType: 'TOTAL', odds: 2.05, line: 2.5 }, { key: 'TOTAL:UNDER:2.5', marketType: 'TOTAL', odds: 1.72, line: 2.5 },
      { key: 'BTTS:YES', marketType: 'BTTS', odds: 1.95 }, { key: 'BTTS:NO', marketType: 'BTTS', odds: 1.8 },
      { key: 'DC:1X', marketType: 'DOUBLE_CHANCE', odds: 1.22 }, { key: 'DC:12', marketType: 'DOUBLE_CHANCE', odds: 1.35 }, { key: 'DC:X2', marketType: 'DOUBLE_CHANCE', odds: 1.6 },
      { key: 'TOTAL:OVER:3.5', marketType: 'TOTAL', odds: 3.1, line: 3.5 }, { key: 'TOTAL:UNDER:3.5', marketType: 'TOTAL', odds: 1.36, line: 3.5 },
      { key: 'AH:HOME:-0.5', marketType: 'HANDICAP', odds: 2.12, line: -0.5 }, { key: 'AH:AWAY:0.5', marketType: 'HANDICAP', odds: 1.75, line: 0.5 },
    ].sort((a, b) => a.key.localeCompare(b.key)).map((m) => expect.objectContaining(m)));
    expect(p.events[0].markets).toHaveLength(14);
    expect(p.stats.skipped).toEqual({ '1st half - 1x2': 1, 'Draw No Bet': 1 });
    expect(() => parseStakeExport({ data: { matches: [] }, meta: {} })).toThrow(ImportError);
  });

  it('matches clubs spelled differently only when both teams and the kickoff agree', () => {
    const k = new Date(Date.now() + 86400_000).toISOString();
    expect(sameImportedMatch({ home: 'Nice', away: 'Stade Rennais', kickoff: k }, { home: 'Nice', away: 'Rennes', kickoff: k })).toBe(true);
    expect(sameImportedMatch({ home: 'Toronto FC', away: 'D.C. United', kickoff: k }, { home: 'Toronto', away: 'DC United', kickoff: k })).toBe(true);
    expect(sameImportedMatch({ home: 'Villarreal', away: 'Espanyol', kickoff: k }, { home: 'Villareal', away: 'Espanyol', kickoff: k })).toBe(true);
    expect(sameImportedMatch({ home: 'Los Chankas', away: 'Cusco FC', kickoff: k }, { home: 'Cultural Santa Rosa', away: 'Cusco FC', kickoff: k })).toBe(false);
    expect(sameImportedMatch({ home: 'Nice', away: 'Stade Rennais', kickoff: k }, { home: 'Nice', away: 'Rennes', kickoff: new Date(Date.parse(k) + 3600_000).toISOString() })).toBe(false);
  });

  it('mixed offer (STAKE_ONLY_OFFER=0): keeps newer The Odds API prices main and only fills the gaps', () => {
    config.limits.stakeOnlyOffer = false;
    try {
    const f = demoFixtures(1)[0];
    const fresh = { ...f, odds: { ...f.odds!, source: 'the-odds-api', observedAt: new Date().toISOString() } };
    const e = { sourceId: 'x', home: f.home, away: f.away, league: null, kickoff: f.kickoff, capturedAt: new Date(Date.now() - 7200_000).toISOString(),
      markets: [{ key: '1X2:HOME', marketType: '1X2' as const, odds: 9 }, { key: 'BTTS:YES', marketType: 'BTTS' as const, odds: 1.7 }] };
    const merged = mergeImported(fresh, e);
    expect(merged.odds!.source).toBe('the-odds-api');
    expect(merged.odds!.markets.find((m) => m.key === '1X2:HOME')!.odds).toBe(f.odds!.markets[0].odds);
    expect(merged.odds!.markets.find((m) => m.key === 'BTTS:YES')).toMatchObject({ odds: 1.7, bookmaker: 'Stake', label: 'Ambele echipe marchează – DA' });
    } finally { config.limits.stakeOnlyOffer = true; }
  });

  it('Stake-only offer (default): Stake prices replace every other source, no background markets', () => {
    const f = demoFixtures(1)[0];
    const fresh = { ...f, odds: { ...f.odds!, source: 'the-odds-api', observedAt: new Date().toISOString() } };
    const e = { sourceId: 'x', home: f.home, away: f.away, league: null, kickoff: f.kickoff, capturedAt: new Date(Date.now() - 7200_000).toISOString(),
      markets: [{ key: '1X2:HOME', marketType: '1X2' as const, odds: 9 }, { key: 'BTTS:YES', marketType: 'BTTS' as const, odds: 1.7 }] };
    const merged = mergeImported(fresh, e);
    expect(merged.odds).toMatchObject({ source: 'stake-import', bookmaker: 'Stake' });
    expect(merged.odds!.markets.map((m) => m.key).sort()).toEqual(['1X2:HOME', 'BTTS:YES']);
  });

  it('a Stake tournament ESPN covers never yields Stake-only duplicates (spelling or later rounds)', () => {
    const at = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
    const ev = (id: string, home: string, away: string, h: number, category: string, slug: string) => ({ sourceId: id, home, away, kickoff: at(h), league: slug, category, tournamentSlug: slug, capturedAt: at(0), markets: [] });
    const known = [{ home: 'FC Midtjylland', away: 'Randers FC', kickoff: at(2), t: Date.parse(at(2)) }];
    const out = stakeOnlyEvents([
      ev('a', 'Midtjylland', 'Randers', 2, 'denmark', 'superligaen'),       // found in the schedule
      ev('b', 'Sonderjyske', 'Copenhagen', 2, 'denmark', 'superligaen'),    // spelling mismatch, same tournament
      ev('c', 'Copenhagen', 'Broendby', 120, 'denmark', 'superligaen'),     // later round not listed yet
      ev('d', 'Pescara', 'Bari', 3, 'italy', 'serie-d-group-f'),            // tournament ESPN does not carry
    ], known);
    expect(out.map((e) => e.sourceId)).toEqual(['d']);
  });

  it('matches spellings seen between Stake and ESPN, one known club per side at the same kickoff, never a youth/women side', () => {
    const k = new Date(Date.now() + 86400_000).toISOString();
    const at = (min: number) => new Date(Date.parse(k) + min * 60_000).toISOString();
    const ev = (home: string, away: string, kickoff = k) => ({ home, away, kickoff });
    expect(findImported({ home: 'Sønderjyske Fodbold', away: 'F.C. København', kickoff: k }, [ev('Sonderjyske', 'Copenhagen')])).toBeTruthy();
    expect(findImported({ home: 'Red Star Belgrade', away: "Inter D'Escaldes", kickoff: k }, [ev('FK Crvena Zvezda', 'Inter Club de Escaldes')])).toBeTruthy();
    expect(findImported({ home: 'Operário PR', away: 'Sport', kickoff: k }, [ev('Operario Ferroviario EC PR', 'SC Recife PE'), ev('Botafogo', 'Vasco')])).toBeTruthy();
    // generic words alone never match ("Dover Athletic" / "Charlton Athletic", "Bristol Rovers" / "Raith Rovers FC")
    expect(findImported({ home: 'Dover Athletic', away: 'Wealdstone', kickoff: k }, [ev('Charlton Athletic', 'Sheffield United')])).toBeUndefined();
    expect(findImported({ home: 'Bristol Rovers', away: 'Cambridge United', kickoff: k }, [ev('Raith Rovers FC', 'Dunfermline Athletic FC')])).toBeUndefined();
    // a women's or youth side is another team
    expect(findImported({ home: 'Copenhagen', away: 'Midtjylland', kickoff: k }, [ev('Copenhagen W', 'Odense W')])).toBeUndefined();
    // two candidates with the same club, or a kickoff far apart: no guess
    expect(findImported({ home: 'Al Faisaly', away: 'Al Diriyah', kickoff: k }, [ev('AL Faisaly FC', 'AL Draih', at(30))])).toBeUndefined();
  });

  it('skips Stake virtual leagues (SRL) and keeps country and tournament for Stake-only leagues', () => {
    const v = { ...match('v1', 'Lazio SRL', 'Roma SRL', new Date(Date.now() + 86400_000).toISOString(), [oneXTwo('Lazio SRL', 'Roma SRL', 2, 3, 4)]), tournament: { name: 'Serie A SRL', slug: 'serie-a-srl', category: 'simulated-reality-league' } };
    const r = { ...match('r1', 'Pescara', 'Bari', new Date(Date.now() + 86400_000).toISOString(), [oneXTwo('Pescara', 'Bari', 2, 3, 4)]), tournament: { name: 'Serie C, Group B', slug: 'serie-c-group-b', category: 'italy' } };
    const p = parseStakeExport(exportOf([v, r]));
    expect(p.events.map((e) => e.sourceId)).toEqual(['r1']);
    expect(stakeLeague(p.events[0])).toEqual({ id: 'STK-italy-serie-c-group-b', provider: 'stake', providerKey: 'italy/serie-c-group-b', name: 'Serie C, Group B', country: 'Italy' });
    expect(stakeFixture(p.events[0])).toMatchObject({ id: 'stk:r1', provider: 'stake', leagueId: 'STK-italy-serie-c-group-b', status: 'pre', odds: { bookmaker: 'Stake', source: 'stake-import' } });
  });
});

describe('Stake import', () => {
  it('saves the export, prices the matching fixtures at once and the agents see Stake as main bookmaker', async () => {
    const fx = demoFixtures(3).map((f, i) => (i === 0 ? { ...f, home: 'Villarreal', away: 'Espanyol' } : f));
    setFixtureProviderForTests(async (_l, days) => ({ fixtures: fx.filter((f) => days.includes(localDate(new Date(f.kickoff)))), errors: [] }));
    await loadFixtures(localDate(), 8, { top10Only: false });
    const res = await importStakeExport(exportOf([
      match('s1', 'Villareal', 'Espanyol', new Date(Date.parse(fx[0].kickoff) + 5 * 60_000).toISOString(), [oneXTwo('Villareal', 'Espanyol', 1.72, 3.6, 4.9)]),
      { ...match('s2', 'Elsewhere', 'Nobody', new Date(Date.now() + 2 * 86400_000).toISOString(), [oneXTwo('Elsewhere', 'Nobody', 2, 3, 4)]), tournament: { name: 'Liga 3', slug: 'liga-3', category: 'nowhere' } },
      match('s3', 'Past', 'Match', new Date(Date.now() - 3600_000).toISOString(), [oneXTwo('Past', 'Match', 2, 3, 4)]),
    ]));
    expect(res).toMatchObject({ saved: 2, matchedFixtures: 1, stakeOnlyFixtures: 1, stats: { matches: 3, priced: 3, mapped: { '1X2': 3 } } });
    const snap = await one<{ source: string; bookmaker: string; markets: Array<{ key: string; odds: number; bookmaker?: string; label: string }> }>(
      'SELECT source,bookmaker,markets FROM odds_snapshots WHERE fixture_id=$1 ORDER BY id DESC LIMIT 1', [fx[0].id]);
    expect(snap).toMatchObject({ source: 'stake-import', bookmaker: 'Stake' });
    expect(snap!.markets.find((m) => m.key === '1X2:HOME')).toMatchObject({ odds: 1.72, bookmaker: 'Stake', label: 'Villarreal câștigă (1)' });
    expect(snap!.markets.find((m) => m.key === 'DC:1X')).toBeUndefined(); // Stake-only offer: no ESPN-side markets
    const loaded = (await loadFixtures(localDate(), 8, { top10Only: false, persist: false })).fixtures;
    expect(loaded.find((f) => f.id === fx[0].id)!.odds!.source).toBe('stake-import');
    expect(loaded.find((f) => f.id === fx[1].id)!.odds!.source).toBe('DEMO');
    // The match the schedule does not carry is offered on its own, in a league of its Stake tournament.
    expect(loaded.find((f) => f.id === 'stk:s2')).toMatchObject({ provider: 'stake', home: 'Elsewhere', away: 'Nobody', odds: { source: 'stake-import', bookmaker: 'Stake' } });
    expect(await importStatus()).toMatchObject({ matches: 2, usable: 2 });
    // An older export never overwrites a newer one.
    await importStakeExport(exportOf([match('s2', 'Elsewhere', 'Nobody', new Date(Date.now() + 2 * 86400_000).toISOString(), [oneXTwo('Elsewhere', 'Nobody', 9, 9, 9)])], new Date(Date.now() - 2 * 3600_000).toISOString()));
    expect(JSON.stringify((await many<{ markets: unknown }>("SELECT markets FROM imported_odds WHERE source_id='s2'"))[0].markets)).toContain('"odds":2');
  });

  it('the owner types the score of a Stake-only match once it was analysed and has started', async () => {
    setFixtureProviderForTests(async () => ({ fixtures: [], errors: [] }));
    const soon = new Date(Date.now() + 3600_000).toISOString();
    await importStakeExport(exportOf([match('s9', 'Pescara', 'Bari', soon, [oneXTwo('Pescara', 'Bari', 2, 3, 4)])]));
    expect(await one("SELECT provider FROM fixtures WHERE id='stk:s9'")).toEqual({ provider: 'stake' });
    await expect(saveStakeResult({ fixtureId: 'stk:s9', home: 1, away: 0 })).rejects.toBeInstanceOf(ResultError); // not started
    await query("UPDATE fixtures SET kickoff_utc=$1 WHERE id='stk:s9'", [new Date(Date.now() - 3 * 3600_000).toISOString()]);
    expect(await pendingStakeResults()).toEqual([]); // nobody analysed it
    const user = (await one<{ id: string }>("INSERT INTO users(google_sub,email) VALUES('stk','stk@test.local') RETURNING id"))!;
    const job = (await one<{ id: string }>(`INSERT INTO ticket_generation_jobs(user_id,slot,period_key,target_odds,required_legs,seed,config,status,stage,checkpoint) VALUES($1,'CUSTOM_1',$2,2,1,'s','{}','COMPLETED','DONE','{}') RETURNING id`, [user.id, localDate()]))!;
    await query(`INSERT INTO agent_predictions(job_id,agent_id,fixture_id,round,provider,model_id,prompt_version,decision,market_key,odds,payload) VALUES($1,'victor','stk:s9',0,'groq','m','v1','BET_CANDIDATE','1X2:HOME',2,'{}')`, [job.id]);
    expect((await pendingStakeResults()).map((p) => p.id)).toEqual(['stk:s9']);
    await expect(saveStakeResult({ fixtureId: 'stk:s9', home: 1, away: 0, htHome: 2, htAway: 0 })).rejects.toBeInstanceOf(ResultError);
    expect(await saveStakeResult({ fixtureId: 'stk:s9', home: 2, away: 1, htHome: 1, htAway: 0 })).toMatchObject({ status: 'post', home: 2, away: 1 });
    expect(await one("SELECT status,home_score,away_score,ht_home FROM fixtures WHERE id='stk:s9'")).toEqual({ status: 'post', home_score: 2, away_score: 1, ht_home: 1 });
    expect(await pendingStakeResults()).toEqual([]);
    await expect(saveStakeResult({ fixtureId: fixtureIdNotStake, home: 1, away: 0 })).rejects.toBeInstanceOf(ResultError);
  });

  it('refuses exports older than the 24-hour validity', async () => {
    await expect(importStakeExport(exportOf([match('s1', 'A', 'B', new Date(Date.now() + 86400_000).toISOString(), [oneXTwo('A', 'B', 2, 3, 4)])], new Date(Date.now() - 25 * 3600_000).toISOString())))
      .rejects.toBeInstanceOf(ImportError);
  });
});
