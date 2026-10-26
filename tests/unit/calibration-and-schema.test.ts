import { describe, expect, it } from 'vitest';
import { calibrated, calibrationOf, sameModel } from '@/lib/calibration';
import { InitialOutputSchema, DebateOutputSchema } from '@/lib/ai/agents';

describe('agent calibration', () => {
  it('needs a minimum sample and shrinks the measured bias toward zero', () => {
    expect(calibrationOf('a', 'm', Array.from({ length: 10 }, () => ({ estimated: 0.8, won: false })))).toBeNull();
    const rows = Array.from({ length: 60 }, (_, i) => ({ estimated: 0.75, won: i < 42 })); // 70% hit, 75% estimated
    const c = calibrationOf('a', 'm', rows)!;
    expect(c.hitRate).toBeCloseTo(0.7);
    expect(c.bias).toBeCloseTo(0.05 * 60 / 100, 3); // shrunk by 60/(60+40)
    expect(calibrated(0.7, c)).toBeCloseTo(0.67, 2);
    expect(calibrated(null, c)).toBeNull();
  });
  it('matches the assigned model including dated variants, not other models', () => {
    expect(sameModel('openai/gpt-6-luna-pro-20261001', 'openai/gpt-6-luna-pro')).toBe(true);
    expect(sameModel('gemini-3.1-flash-lite', 'z-ai/glm-5.3-flash')).toBe(false);
  });
});

describe('agent answers in varied formats', () => {
  it('keeps answers whose values are only formatted differently', () => {
    const r = InitialOutputSchema.parse({ predictions: [
      { fixtureId: 12, decision: 'bet', marketKey: 'DC:1X', estimatedProbability: '78%', confidence: 0.8, risk: 'mediu', evidence: 'o singură dovadă', rationale: 'x'.repeat(1200), alternatives: [{ marketKey: null }, { marketKey: 'BTTS:YES', estimatedProbability: 61 }] },
      null,
    ] });
    expect(r.predictions).toHaveLength(1);
    expect(r.predictions[0]).toMatchObject({ fixtureId: '12', decision: 'BET_CANDIDATE', estimatedProbability: 0.78, confidence: 80, risk: 'MEDIUM', evidence: ['o singură dovadă'] });
    expect(r.predictions[0].rationale).toHaveLength(900);
    expect(r.predictions[0].alternatives).toEqual([{ marketKey: 'BTTS:YES', estimatedProbability: 0.61, reason: '' }]);
  });
  it('never invents a probability from an unreadable value', () => {
    const r = DebateOutputSchema.parse({ revisions: [{ fixtureId: 'a', decision: 'NO_BET', estimatedProbability: 'ridicată', risk: 'HIGH', objection: { to: 'x' } }] });
    expect(r.revisions[0].estimatedProbability).toBeNull();
    expect(typeof r.revisions[0].objection).toBe('string');
  });
});
