import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { one, query } from '@/lib/db';
import { createImportToken, importTokenStatus, importTokenUser, revokeImportTokens } from '@/lib/import-token';
import { importStakeLive, parseStakeLive } from '@/lib/sports/imported-prices';
import { closePool, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(closePool);

describe('automatic import key', () => {
  it('is shown once, stored hashed, replaced by a new one and revocable', async () => {
    const u = (await one<{ id: string }>("INSERT INTO users(google_sub,email) VALUES('o','o@t') RETURNING id"))!;
    const a = await createImportToken(u.id);
    expect(a).toMatch(/^p11imp_/);
    expect(await one('SELECT count(*)::int AS n FROM import_tokens WHERE token_hash=$1', [a])).toEqual({ n: 0 }); // only the hash
    expect(await importTokenUser(`Bearer ${a}`)).toBe(u.id);
    expect((await importTokenStatus(u.id)).lastUsedAt).not.toBeNull();
    const b = await createImportToken(u.id);
    expect(await importTokenUser(`Bearer ${a}`)).toBeNull();
    expect(await importTokenUser(`Bearer ${b}`)).toBe(u.id);
    expect(await importTokenUser(`Token ${b}`)).toBeNull();
    await revokeImportTokens(u.id);
    expect(await importTokenUser(`Bearer ${b}`)).toBeNull();
    expect(await importTokenStatus(u.id)).toMatchObject({ active: false });
  });
});

describe('Stake live scores', () => {
  const live = (id: string, h: number | null, a: number | null, status: string, time: string | null = null) => ({ source_id: id, event_status: { homeScore: h, awayScore: a, matchStatus: status, clock: { matchTime: time } } });
  it('knows both spellings Stake uses (seen on a real live export)', () => {
    const st = (x: string) => parseStakeLive({ data: { matches: [live('a', 0, 0, x)] } })[0].ended;
    for (const x of ['FirstHalf', 'SecondHalf', 'HalfTime', '1st half', '2nd half']) expect(st(x)).toBe(false);
    for (const x of ['Ended', 'FullTime', 'Full time', 'AfterExtraTime', 'AfterPenalties', 'Finished']) expect(st(x)).toBe(true);
  });
  it('reads in-play and ended matches, ignores the rest', () => {
    const s = parseStakeLive({ data: { matches: [live('a', 1, 0, '2nd half', '67:12'), live('b', 2, 2, 'Ended'), live('c', null, null, 'Not started'), { source_id: 'd' }] }, meta: { state: 'live' } });
    expect(s).toEqual([
      { sourceId: 'a', home: 1, away: 0, ended: false, clock: "67'", status: '2nd half' },
      { sourceId: 'b', home: 2, away: 2, ended: true, clock: null, status: 'Ended' },
    ]);
  });
  it('updates only Stake-only fixtures: live score while playing, final score when Stake marks it ended', async () => {
    await query("INSERT INTO leagues(id,country,name,provider,provider_key,priority,top10) VALUES('STK-x-y','X','Y','stake','x/y',950,false) ON CONFLICT (id) DO NOTHING");
    for (const id of ['a', 'b']) await query(`INSERT INTO fixtures(id,provider,provider_id,league_id,home_team,away_team,kickoff_utc,status,content_hash) VALUES($1,'stake',$2,'STK-x-y','H','A',now()-interval '1 hour','pre','h')`, [`stk:${id}`, id]);
    expect(await importStakeLive({ data: { matches: [live('a', 1, 0, '2nd half', '67:00'), live('b', 3, 1, 'Ended'), live('zzz', 1, 1, 'Ended')] }, meta: { state: 'live' } })).toMatchObject({ inPlay: 1, ended: 2 });
    expect(await one("SELECT status,home_score,away_score,live_clock FROM fixtures WHERE id='stk:a'")).toEqual({ status: 'in', home_score: 1, away_score: 0, live_clock: "67'" });
    expect(await one("SELECT status,home_score,away_score FROM fixtures WHERE id='stk:b'")).toEqual({ status: 'post', home_score: 3, away_score: 1 });
    // a later in-play row never reopens a finished match
    await importStakeLive({ data: { matches: [live('b', 3, 1, '2nd half', '89:00')] }, meta: { state: 'live' } });
    expect(await one("SELECT status FROM fixtures WHERE id='stk:b'")).toEqual({ status: 'post' });
  });
});
