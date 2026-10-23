import { describe, expect, it } from 'vitest';
import { agentProgression } from '@/lib/agent-progression';

describe('cosmetic agent career progression', () => {
  it('starts untested agents at level one and keeps editorial roles unranked', () => {
    expect(agentProgression({ won: 0, lost: 0 })).toMatchObject({ level: 1, xp: 0, progress: 0, rank: { name: 'Normal' } });
    expect(agentProgression({ won: 100, lost: 0 }, true)).toBeNull();
  });
  it('adds confirmed wins, deducts losses and floors points at zero', () => {
    expect(agentProgression({ won: 27, lost: 2 })).toMatchObject({ xp: 780, level: 8, progress: 80, toNextLevel: 20 });
    expect(agentProgression({ won: 1, lost: 5 })).toMatchObject({ xp: 0, level: 1 });
  });
  it('requires both a sufficient sample and accuracy, rather than promoting one lucky result', () => {
    expect(agentProgression({ won: 1, lost: 0 })!.rank.name).toBe('Normal');
    expect(agentProgression({ won: 3, lost: 2 })!.rank.name).toBe('Rafinat');
    expect(agentProgression({ won: 6, lost: 4 })!.rank.name).toBe('Unic');
    expect(agentProgression({ won: 11, lost: 4 })!.rank.name).toBe('Elite');
    expect(agentProgression({ won: 12, lost: 3 })!.rank.name).toBe('Super');
    expect(agentProgression({ won: 59, lost: 16 })!.rank.name).toBe('Elite');
  });
  it('gives the requested top records Super while retaining a minimum confirmed sample', () => {
    expect(agentProgression({ won: 27, lost: 2 })!.rank.name).toBe('Super');
    expect(agentProgression({ won: 14, lost: 3 })!.rank.name).toBe('Super');
    expect(agentProgression({ won: 14, lost: 0 })!.rank.name).toBe('Unic');
  });
  it('recalculates rank and level after a corrected or red result', () => {
    const before = agentProgression({ won: 21, lost: 9 })!, after = agentProgression({ won: 20, lost: 10 })!;
    expect(after.rank.name).toBe('Unic');
    expect(after.xp).toBe(before.xp - 45);
    expect(agentProgression({ won: 60, lost: 15 })!.nextRank).toBeNull();
  });
});
