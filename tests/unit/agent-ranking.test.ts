import { expect, it } from 'vitest';
import { rankAgents, topSixAgentIds } from '@/lib/agent-ranking';
const a = (id: string, won: number, lost: number, bets = won + lost, editorial = false) => ({ id, won, lost, bets, hitRate: won + lost ? won / (won + lost) : null, editorial });
it('uses the Statistics ordering and preserves the input and stable ties', () => {
  const agents = [a('pending',0,0,100), a('lower',6,4), a('tie-first',8,2), a('tie-second',8,2), a('more-picks',8,2,20)];
  expect(rankAgents(agents).map((x) => x.id)).toEqual(['more-picks','tie-first','tie-second','lower','pending']);
  expect(agents[0].id).toBe('pending');
});
it('takes six voting agents in rank order, excluding editorial roles and undecided records', () => {
  const agents = [a('editorial',10,0,10,true), a('undecided',0,0), ...Array.from({length:8},(_,i)=>a(`v${i}`,i+1,1))];
  expect(topSixAgentIds(agents)).toEqual(['v7','v6','v5','v4','v3','v2']);
});
it('does not fill a sparse ranking with agents without results', () => {
  expect(topSixAgentIds([a('one',1,0),a('empty',0,0),a('news',1,0,1,true)])).toEqual(['one']);
});
