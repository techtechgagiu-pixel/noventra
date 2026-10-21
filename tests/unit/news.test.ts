import { describe, expect, it } from 'vitest';
import { aboutThisFixture, parseRss, teamTokens } from '@/lib/news/google-news';

describe('news headlines for Hanțu', () => {
  it('parses Google News RSS items, separating outlet from title', () => {
    const xml = `<rss><channel><item><title>Probleme pentru FCSB: Muhar riscă să fie indisponibil - OnlineSport.ro</title><link>https://news.google.com/a</link><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><source url="https://onlinesport.ro">OnlineSport.ro</source></item><item><title>broken</title></item></channel></rss>`;
    const items = parseRss(xml, 'ro');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Probleme pentru FCSB: Muhar riscă să fie indisponibil', source: 'OnlineSport.ro', publishedAt: '2026-10-20T10:00:00.000Z', lang: 'ro' });
  });
  it('identifies teams by distinctive words, not generic ones', () => {
    expect(teamTokens('Wolverhampton Wanderers')).toContain('wolverhampton');
    expect(teamTokens('Wolverhampton Wanderers')).not.toContain('wanderers');
    expect(teamTokens('Manchester City')).toContain('manchester');
  });
  it('drops previews of a different fixture but keeps team news', () => {
    expect(aboutThisFixture('Predicted Lineups and Player News for Kaiserslautern vs VfL Bochum', 'VfL Wolfsburg')).toBe(false);
    expect(aboutThisFixture('PEC Zwolle vs Go Ahead Eagles Prediction, Betting Tips, Lineups & Odds', 'Telstar')).toBe(false);
    expect(aboutThisFixture('Preview: Lillestrom vs Real Sociedad - prediction, team news, lineups', 'Real Sociedad')).toBe(true);
    expect(aboutThisFixture('Lugano vs Red Star at 6:45 pm: no Katai or Bukari', 'F.C. København')).toBe(true);
  });
});
