import { describe, expect, it } from 'vitest';
import { coachedAgent, coachingForTeam, coachingOf, coachingText } from '@/lib/coaching';
import { characterViolation } from '@/lib/jobs/analysis';

const picks = (family: string, won: number, lost: number, odds = 1.3) => [
  ...Array.from({ length: won }, () => ({ family, odds, won: true })),
  ...Array.from({ length: lost }, () => ({ family, odds, won: false })),
];
const alex = { id: 'alex', maxOdds: 2.5, minProbability: 0.45, temperature: 0.6 };

describe('agent coaching', () => {
  it('leaves an agent in line with the team alone, and needs a real sample', () => {
    expect(coachingOf(alex, picks('DC', 72, 28), 0.73)).toBeNull();
    expect(coachingOf(alex, picks('DC', 10, 10), 0.73)).toBeNull();
  });

  it('tightens a clearly weaker agent and closes the bet types it keeps losing', () => {
    // Pattern seen in production: weak on handicap and total goals, decent on double chance.
    const c = coachingOf(alex, [...picks('DC', 60, 30), ...picks('AH', 4, 8, 1.7), ...picks('TOTAL', 4, 9, 1.8), ...picks('TT', 9, 3)], 0.73)!;
    expect(c.level).toBe(2);
    expect(c.maxOdds).toBe(1.4);
    expect(c.minProbability).toBe(0.7);
    expect(c.temperature).toBe(0.15);
    expect(c.blocked.map((b) => b.family)).toEqual(['TOTAL', 'AH']);
    expect(c.highOdds).toEqual({ won: 8, n: 25 });
    const text = coachingText(c)!;
    expect(text).toMatch(/ANTRENAMENT STRICT/);
    expect(text).toMatch(/handicap asiatic \(AH, 4\/12\)/);
  });

  it('a milder gap gives milder limits and never loosens an already strict character', () => {
    const victor = { id: 'victor', maxOdds: 1.55, minProbability: 0.68, temperature: 0.2 };
    const c = coachingOf(victor, picks('DC', 68, 32), 0.73)!;
    expect(c.level).toBe(1);
    expect(c.maxOdds).toBe(1.5);
    expect(c.minProbability).toBe(0.72);
    expect(c.temperature).toBe(0.2);
  });

  it('the coached limits are enforced on votes, including closed bet types', () => {
    const c = coachingOf(alex, [...picks('DC', 60, 30), ...picks('AH', 4, 8)], 0.73)!;
    const coached = { ...coachedAgent({ ...alex, name: 'Qwen' }, c) };
    const policy = { minOdds: 1.1, maxOdds: 3, minProbability: 0.5 };
    const vote = (marketKey: string, estimatedProbability: number) => ({ agentId: 'alex', decision: 'BET_CANDIDATE' as const, marketKey, estimatedProbability, alternatives: [] }) as never;
    expect(characterViolation(vote('AH:HOME:-0.5', 0.8), coached, policy, { odds: 1.3, estimatedProbability: 0.8 })).toMatch(/antrenament/);
    expect(characterViolation(vote('DC:1X', 0.8), coached, policy, { odds: 1.55, estimatedProbability: 0.8 })).toMatch(/depășește limita 1.40/);
    expect(characterViolation(vote('DC:1X', 0.66), coached, policy, { odds: 1.3, estimatedProbability: 0.8 })).toMatch(/sub pragul personal de 70%/);
    expect(characterViolation(vote('DC:1X', 0.78), coached, policy, { odds: 1.3, estimatedProbability: 0.8 })).toBeNull();
  });

  it('compares each agent with the team, on its current model only', () => {
    const rows = [
      ...Array.from({ length: 100 }, (_, i) => ({ agent_id: 'robert', model_id: 'm1', market_key: 'DC:1X', odds: 1.2, outcome: i < 82 ? 'WON' : 'LOST' })),
      ...Array.from({ length: 100 }, (_, i) => ({ agent_id: 'alex', model_id: 'm2', market_key: 'DC:1X', odds: 1.4, outcome: i < 62 ? 'WON' : 'LOST' })),
      ...Array.from({ length: 100 }, () => ({ agent_id: 'alex', model_id: 'old', market_key: 'DC:1X', odds: 1.4, outcome: 'LOST' })),
    ];
    const team = coachingForTeam([alex, { id: 'robert', maxOdds: 1.5, minProbability: 0.7, temperature: 0.2 }], new Map([['alex', 'm2'], ['robert', 'm1']]), rows);
    expect(team.has('robert')).toBe(false);
    expect(team.get('alex')).toMatchObject({ n: 100, won: 62, teamRate: 0.72 });
  });
});
