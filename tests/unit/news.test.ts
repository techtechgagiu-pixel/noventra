import { describe, expect, it } from 'vitest';
import { parseRss, teamTokens } from '@/lib/news/google-news';

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
});
