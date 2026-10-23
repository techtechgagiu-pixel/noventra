import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { one, query } from '@/lib/db';
import { recordEvent } from '@/lib/jobs/events';
import { homeThreads } from '@/lib/home-reel';
import { closePool, makeUser, resetDb } from './helpers';

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await closePool(); });

describe('home debate fragments', () => {
  it('builds a real thread (pick, objection, change of mind, brain) and Hanțu news card from recorded events', async () => {
    const u = await makeUser();
    const job = (await one<{ id: string }>(`INSERT INTO ticket_generation_jobs (user_id, slot, period_key, target_odds, seed, config, checkpoint, status, stage) VALUES ($1,'FIVE_A',current_date,5,'s','{}','{}','COMPLETED','DONE') RETURNING id`, [u]))!.id;
    const fx = 'espn:1'; const match = 'Bayern Munich – Arsenal';
    const ev = (type: string, agentId: string | null, payload: Record<string, unknown>) => recordEvent(job, { type: type as never, stage: 'ANALYSIS', fixtureId: fx, agentId, payload });
    await ev('NEWS_COLLECTED', 'hantu', { match, home: 2, away: 1, headlines: [{ title: 'Bayern fără doi titulari', source: 'Prosport' }, { title: 'Arsenal, lot complet', source: 'GSP' }] });
    await ev('PREDICTION_SAVED', 'hantu', { match, decision: 'BET_CANDIDATE', marketKey: 'DC:1X', marketLabel: 'Bayern sau egal (1X)', odds: 1.36, rationale: 'Titlurile [H1] arată absențe, dar gazdele rămân favorite.', evidence: ['[H1] Bayern fără doi titulari'] });
    await ev('PREDICTION_SAVED', 'andrei', { match, decision: 'BET_CANDIDATE', marketKey: 'DC:1X', marketLabel: 'Bayern sau egal (1X)', odds: 1.36, rationale: 'Modelul dă 72%.' });
    await ev('PREDICTION_SAVED', 'robert', { match, decision: 'NO_BET', marketKey: null, rationale: 'Eșantion mic.' });
    await ev('OBJECTION_RECORDED', 'alex', { round: 1, objection: 'Lucescu ignoră forma de acasă.' });
    await ev('POSITION_REVISED', 'victor', { round: 1, changed: true, decision: 'BET_CANDIDATE', marketKey: 'DC:1X', marketLabel: 'Bayern sau egal (1X)', response: 'Accept argumentul lui Mutu.' });
    await ev('BRAIN_DECISION', 'robert', { match, choice: 'DC:1X', label: 'Bayern sau egal (1X)', odds: 1.36, reason: 'Susținut de 6 agenți.' });
    await ev('SELECTION_ACCEPTED', null, { match, marketLabel: 'Bayern sau egal (1X)', odds: 1.36 });
    const { threads, news } = await homeThreads(u);
    expect(threads).toHaveLength(1);
    const kinds = threads[0].messages.map((m) => m.kind);
    expect(kinds).toEqual(['pick', 'nobet', 'objection', 'revised', 'brain', 'result']);
    expect(threads[0].match).toBe(match);
    expect(news?.headlines).toHaveLength(2);
    expect(news?.take).toContain('[H1]');
  });
  it('shows completed shared debates to a new account while keeping personal scope and unfinished work separate', async () => {
    const owner = await makeUser('owner-home@test.local');
    const visitor = await makeUser('new-home@test.local');
    const job = (await one<{ id: string }>(`INSERT INTO ticket_generation_jobs (user_id,slot,period_key,target_odds,seed,config,checkpoint,status,stage) VALUES ($1,'CUSTOM_1',current_date,5,'home','{}','{}','RUNNING','DEBATE') RETURNING id`, [owner]))!.id;
    await recordEvent(job, { type: 'PREDICTION_SAVED', stage: 'ANALYSIS', fixtureId: 'demo:home', agentId: 'andrei', payload: { match: 'DEMO Gazde – DEMO Oaspeți', decision: 'BET_CANDIDATE', marketLabel: 'DEMO 1X', marketKey: 'DC:1X', odds: 1.4, rationale: 'Argument salvat, fără o nouă inferență.' } });
    await recordEvent(job, { type: 'OBJECTION_RECORDED', stage: 'DEBATE', fixtureId: 'demo:home', agentId: 'alex', payload: { objection: 'Un contraargument real din jurnal.' } });
    await recordEvent(job, { type: 'BRAIN_DECISION', stage: 'VOTING', fixtureId: 'demo:home', agentId: 'robert', payload: { match: 'DEMO Gazde – DEMO Oaspeți', choice: 'DC:1X', label: 'DEMO 1X', odds: 1.4, reason: 'Verdictul salvat.' } });
    expect((await homeThreads(visitor, 'community')).threads).toHaveLength(0);
    await query("UPDATE ticket_generation_jobs SET status='COMPLETED',stage='DONE',finished_at=now() WHERE id=$1", [job]);
    expect((await homeThreads(visitor)).threads).toHaveLength(0);
    const shared = (await homeThreads(visitor, 'community')).threads;
    expect(shared).toHaveLength(1);
    expect(shared[0].messages.map((m) => m.kind)).toEqual(['pick','objection','brain']);
    expect(shared[0].key).toContain(job);
  });

});
