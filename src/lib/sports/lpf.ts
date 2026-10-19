import type { Fixture, League } from './types';
import { sportsGet } from './http';
import { localDate } from '../time';

// Ported from the earlier BETMIND SIX Cloudflare version. LPF publishes the official SuperLiga
// schedule but no bookmaker odds, so these fixtures can be shown but never qualify for a ticket.
const clean = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function bucharestKickoff(isoDay: string, time: string) {
  const [y, m, d] = isoDay.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const guessed = Date.UTC(y, m - 1, d, h, min);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guessed));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const offset = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - guessed;
  return new Date(guessed - offset).toISOString();
}

export function parseLpf(html: string, league: League, days: string[], observedAt: string): Fixture[] {
  const program = html.match(/<div class="program-etapa[\s\S]*?<div class="widget-row-footer"/)?.[0];
  if (!program) return [];
  const names = new Map<string, string>();
  for (const a of html.matchAll(/href="cluburi\/[^/]+\/(\d+)\/clasament" title="([^"]+)"/g)) names.set(a[1], a[2]);
  const roDay = (d: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'long' }).format(new Date(`${d}T12:00:00Z`));
  let currentDay: string | undefined;
  let currentTime = '';
  const out: Fixture[] = [];
  for (const token of program.matchAll(/class="widget-row-day">([^<]+)|class="widget-row-day-hour">([^<]+)|class="widget-row-flex">([\s\S]*?)(?=<div class="widget-row-|$)/g)) {
    if (token[1]) {
      const dayText = clean(token[1]).toLowerCase();
      currentDay = days.find((d) => dayText.includes(roDay(d).toLowerCase()));
    } else if (token[2]) currentTime = clean(token[2]);
    else if (token[3] && currentDay && /^\d{2}:\d{2}$/.test(currentTime)) {
      const teams = [...token[3].matchAll(/<a href="cluburi\/([^/]+)\/(\d+)\/calendar">([\s\S]*?)<\/a>/g)];
      if (teams.length !== 2) continue;
      const [home, away] = teams;
      const scores = [...token[3].matchAll(/<span[^>]*>(\d+|-)<\/span>/g)].map((m) => m[1]);
      const completed = scores.length === 2 && scores.every((s) => s !== '-');
      const kickoff = bucharestKickoff(currentDay, currentTime);
      if (localDate(new Date(kickoff)) !== currentDay) continue;
      out.push({
        id: `lpf:${currentDay}-${home[2]}-${away[2]}`, provider: 'lpf', providerId: `${currentDay}-${home[2]}-${away[2]}`,
        leagueId: league.id, leagueKey: league.providerKey, leagueName: league.name, country: league.country,
        home: names.get(home[2]) || home[1].replaceAll('-', ' '), away: names.get(away[2]) || away[1].replaceAll('-', ' '),
        homeTeamId: home[2], awayTeamId: away[2], kickoff, status: completed ? 'post' : 'pre',
        homeScore: completed ? Number(scores[0]) : null, awayScore: completed ? Number(scores[1]) : null,
        odds: null, fetchedAt: observedAt,
      });
    }
  }
  return out;
}

export async function lpfFixtures(league: League, days: string[]): Promise<Fixture[]> {
  const html = await sportsGet<string>('https://lpf.ro/', { provider: 'lpf', ttlMs: 30 * 60_000, as: 'text' });
  return parseLpf(html, league, days, new Date().toISOString());
}
