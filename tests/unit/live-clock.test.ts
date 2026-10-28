import { describe, expect, it } from 'vitest';
import { liveClock } from '@/lib/sports/espn';

describe('live match minute shown next to the score', () => {
  it('keeps the minute ESPN shows while the match is in play', () => {
    expect(liveClock({ displayClock: "67'", type: { state: 'in', name: 'STATUS_SECOND_HALF' } })).toBe("67'");
    expect(liveClock({ displayClock: "45'+2'", type: { state: 'in', name: 'STATUS_FIRST_HALF' } })).toBe("45'+2'");
    expect(liveClock({ displayClock: '12', type: { state: 'in', name: 'STATUS_FIRST_HALF' } })).toBe("12'");
  });
  it('says half time and has no minute before or after the match', () => {
    expect(liveClock({ displayClock: "45'", type: { state: 'in', name: 'STATUS_HALFTIME' } })).toBe('Pauză');
    expect(liveClock({ displayClock: "90'", type: { state: 'post', name: 'STATUS_FULL_TIME' } })).toBeNull();
    expect(liveClock({ displayClock: "0'", type: { state: 'pre', name: 'STATUS_SCHEDULED' } })).toBeNull();
  });
});
