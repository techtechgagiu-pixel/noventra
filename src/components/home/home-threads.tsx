'use client';
import { useEffect, useRef, useState } from 'react';
import { AGENT_META, fmtDateTime } from '@/lib/format';
import type { NewsCard, Thread, ThreadMsg } from '@/lib/home-reel';

const VERB: Record<ThreadMsg['kind'], string> = { pick: 'propune', nobet: 'refuză', objection: 'contestă', revised: 'își schimbă poziția', kept: 'nu cedează', brain: 'decide', result: '', news: '' };

/** Plays the messages of a fragment one after another once it scrolls into view (all at once with reduced motion). */
function useReveal(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(count); return; }
    let timer: ReturnType<typeof setInterval> | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || timer) return;
      setN(1);
      timer = setInterval(() => setN((x) => { if (x >= count) { clearInterval(timer!); return x; } return x + 1; }), 900);
    }, { threshold: 0.12 });
    io.observe(el);
    return () => { io.disconnect(); if (timer) clearInterval(timer); };
  }, [count]);
  return { ref, n };
}

function Bubble({ m }: { m: ThreadMsg }) {
  if (m.kind === 'result') return <p className={`ml-12 rounded-lg border px-3 py-2 text-sm font-semibold ${m.good ? 'border-emerald/40 bg-emerald/10 text-emerald' : 'border-rose/40 bg-rose/10 text-rose'}`}>{m.good ? '✓ ' : '✗ '}{m.text}</p>;
  const meta = m.agentId ? AGENT_META[m.agentId] : null;
  const hot = m.kind === 'objection' || m.kind === 'brain';
  return (
    <div className="flex gap-3">
      <img src={meta?.img} alt="" className="mt-0.5 h-9 w-9 shrink-0 rounded-full border-2 object-cover" style={{ borderColor: meta?.accent }} />
      <div className={`min-w-0 rounded-2xl rounded-tl-sm border px-3.5 py-2.5 ${hot ? 'border-gold/50 bg-gold/[.07]' : 'border-line bg-ink/50'}`}>
        <p className="text-xs"><span className="font-bold" style={{ color: meta?.accent }}>{meta?.name ?? m.agentId}</span> <span className={hot ? 'text-gold' : 'text-muted'}>{VERB[m.kind]}</span></p>
        {m.chip && <p className="mt-1 inline-block rounded-md bg-cyan/10 px-1.5 py-0.5 text-[11px] font-semibold text-cyan">{m.chip}</p>}
        <p className="mt-1 text-[14px] leading-snug text-text/90">„{m.text}”</p>
      </div>
    </div>
  );
}

function ThreadCard({ t }: { t: Thread }) {
  const { ref, n } = useReveal(t.messages.length);
  return (
    <article ref={ref} className="rounded-[1.4rem] border border-line bg-panel/60 p-4 md:p-5">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold leading-tight">{t.match}</h3>
        <p className="text-[11px] text-muted">{t.title}, {fmtDateTime(t.at)}</p>
      </header>
      <div className="space-y-2.5">
        {t.messages.map((m, i) => (
          <div key={m.seq} className="transition-[opacity,transform] duration-500" style={{ opacity: i < n ? 1 : 0, transform: i < n ? 'none' : 'translateY(8px)' }} aria-hidden={i >= n}>
            <Bubble m={m} />
          </div>
        ))}
      </div>
    </article>
  );
}

function News({ c }: { c: NewsCard }) {
  const { ref, n } = useReveal(c.headlines.length + (c.take ? 1 : 0));
  const h = AGENT_META.hantu;
  return (
    <aside ref={ref} className="rounded-[1.4rem] border border-[#84cc16]/40 bg-[linear-gradient(180deg,rgba(132,204,22,.08),rgba(15,26,53,.6))] p-4 md:p-5" aria-label="Știrile lui Nemotron 3.5 Super VL">
      <div className="flex items-center gap-3">
        <img src={h.img} alt="" className="h-12 w-12 rounded-full border-2 object-cover" style={{ borderColor: h.accent }} />
        <div><p className="font-display text-lg font-bold leading-tight" style={{ color: h.accent }}>Nemotron 3.5 Super VL a citit presa</p><p className="text-xs text-muted">{c.match}, {fmtDateTime(c.at)}</p></div>
      </div>
      <ul className="mt-4 space-y-2">
        {c.headlines.map((x, i) => (
          <li key={i} className="rounded-xl border border-line bg-ink/50 px-3 py-2 text-sm transition-opacity duration-500" style={{ opacity: i < n ? 1 : 0 }}>
            {x.link ? <a href={x.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{x.title}</a> : x.title}
            {x.source && <span className="mt-0.5 block text-[11px] text-muted">{x.source}</span>}
          </li>
        ))}
      </ul>
      {c.take && (
        <div className="mt-4 transition-opacity duration-500" style={{ opacity: n > c.headlines.length ? 1 : 0 }}>
          {c.pick && <p className="inline-block rounded-md bg-[#84cc16]/15 px-1.5 py-0.5 text-[11px] font-semibold text-[#a3e635]">{c.pick}</p>}
          <p className="mt-1.5 text-[14px] leading-snug">„{c.take}”</p>
        </div>
      )}
    </aside>
  );
}

export function HomeThreads({ threads, news }: { threads: Thread[]; news: NewsCard | null }) {
  if (!threads.length && !news) return null;
  return (
    <section aria-labelledby="din-dezbateri" className="space-y-4">
      <div>
        <h2 id="din-dezbateri" className="font-display text-[1.9rem] font-bold leading-tight tracking-tight">Din dezbateri</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">Fragmente reale din analizele ultimelor zile: cine a propus, cine a contestat, cine a cedat și ce a ales creierul.</p>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">{threads.map((t) => <ThreadCard key={t.key} t={t} />)}</div>
        {news && <News c={news} />}
      </div>
    </section>
  );
}
