import { sportsGet } from '../sports/http';

/**
 * Real, dated sports-news headlines about a team (Google News RSS — personal, non-commercial use).
 * Only headline, outlet, date and link are kept; nothing is summarised or invented here.
 */
export type NewsItem = { title: string; source: string | null; publishedAt: string; link: string; lang: 'en' | 'ro' };

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .trim();

export function parseRss(xml: string, lang: 'en' | 'ro'): NewsItem[] {
  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const get = (tag: string) => { const r = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return r ? decode(r[1]) : null; };
    const rawTitle = get('title');
    const pub = get('pubDate');
    const link = get('link');
    if (!rawTitle || !pub || !link) continue;
    const source = get('source');
    // Google appends " - Outlet" to titles; keep the outlet separately.
    const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    const d = new Date(pub);
    if (Number.isNaN(d.getTime())) continue;
    items.push({ title, source, publishedAt: d.toISOString(), link, lang });
  }
  return items;
}

const QUERIES = {
  en: (t: string) => `"${t}" (injury OR injured OR doubt OR suspended OR ruled out OR crisis OR wages OR unpaid OR dressing room OR row OR sacked OR lineup) when:7d`,
  ro: (t: string) => `"${t}" (accidentat OR accidentare OR indisponibil OR suspendat OR salarii OR restanțe OR conflict OR vestiar OR criză OR demis) when:7d`,
} as const;
const FEEDS = {
  en: (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-GB&gl=GB&ceid=GB:en`,
  ro: (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ro&gl=RO&ceid=RO:ro`,
} as const;

const GENERIC = new Set(['united', 'city', 'club', 'football', 'sporting', 'athletic', 'real', 'olympique', 'racing', 'calcio', 'borussia', 'wanderers', 'rovers', 'town', 'albion', 'hotspur', 'county']);
/** Words that identify the team in a headline (full name, or its distinctive words of ≥ 4 letters). */
export function teamTokens(team: string) {
  const words = team.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Za-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC.has(w.toLowerCase()));
  return [team.toLowerCase(), ...words.map((w) => w.toLowerCase())];
}
const mentions = (title: string, tokens: string[]) => { const t = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return tokens.some((k) => t.includes(k)); };

/** Up to `limit` distinct headlines from the 10 days before kickoff (never after it). */
export async function teamNews(team: string, kickoff: string, limit = 8): Promise<{ items: NewsItem[]; errors: string[] }> {
  const errors: string[] = [];
  const all: NewsItem[] = [];
  for (const lang of ['en', 'ro'] as const) {
    try {
      const xml = await sportsGet<string>(FEEDS[lang](QUERIES[lang](team)), { provider: 'gnews', ttlMs: 2 * 3600_000, as: 'text', timeoutMs: 12_000 });
      all.push(...parseRss(xml, lang));
    } catch (e) {
      errors.push(`Știri ${lang}: ${(e as Error).message}`);
    }
  }
  const end = Math.min(Date.parse(kickoff), Date.now());
  const start = end - 10 * 24 * 3600_000;
  const seen = new Set<string>();
  const tokens = teamTokens(team);
  const items = all
    .filter((n) => { const t = Date.parse(n.publishedAt); return t <= end && t >= start && mentions(n.title, tokens); })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .filter((n) => { const k = n.title.toLowerCase().replace(/\W+/g, ' ').slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, limit);
  return { items, errors };
}
