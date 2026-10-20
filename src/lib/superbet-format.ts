/**
 * Maps our canonical market keys to the wording a person looks for in the Superbet app/site,
 * so a ticket can be rebuilt by hand. No connection to Superbet is made.
 */
export type SuperbetPick = { market: string; pick: string; note?: string };

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function superbetPick(key: string, home: string, away: string): SuperbetPick {
  const [type, a, b, c] = key.split(':');
  switch (type) {
    case '1X2':
      return { market: 'Final (1X2)', pick: a === 'HOME' ? '1' : a === 'DRAW' ? 'X' : '2' };
    case 'DC':
      return { market: 'Șansă dublă', pick: a };
    case 'TOTAL':
      return { market: 'Total goluri', pick: `${a === 'OVER' ? 'Peste' : 'Sub'} ${b}` };
    case 'TT': {
      const team = a === 'HOME' ? home : away;
      return { market: `Total goluri ${team}`, pick: `${b === 'OVER' ? 'Peste' : 'Sub'} ${c}`, note: `goluri marcate doar de ${team}` };
    }
    case 'AH': {
      const line = Number(b);
      const team = a === 'HOME' ? home : away;
      // ±0.5 Asian lines are the same bet as simpler markets — easier to find.
      if (line === -0.5) return { market: 'Final (1X2)', pick: a === 'HOME' ? '1' : '2', note: `echivalent cu handicap ${team} -0.5` };
      if (line === 0.5) return { market: 'Șansă dublă', pick: a === 'HOME' ? '1X' : 'X2', note: `echivalent cu handicap ${team} +0.5` };
      return { market: 'Handicap asiatic', pick: `${team} ${signed(line)}` };
    }
    default:
      return { market: key, pick: '' };
  }
}
