import { espnExtraMarkets } from '../../src/lib/sports/espn';
import { closePool } from '../../src/lib/db';
const m = await espnExtraMarkets({ leagueKey: 'eng.1', providerId: '401879256', home: 'Aston Villa', away: 'Manchester City', homeTeamId: '362', awayTeamId: '382' });
console.log(m.map((x) => `${x.key} ${x.odds} ${x.bookmaker}`).join('\n'));
await closePool();
