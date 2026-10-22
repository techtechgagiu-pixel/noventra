import Link from 'next/link';
import { AGENT_META } from '@/lib/format';
import { GoogleSignIn } from '@/components/google-sign-in';

/** Public introduction only: no tickets, account data, database reads or inference. */
export function PublicHome({ google }: { google: boolean }) {
  const agents = Object.entries(AGENT_META).filter(([id]) => id !== 'scout');
  return <>
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label="Primul 11 — Acasă" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          <span className="hidden sm:inline">PRIMUL <span className="text-cyan">11</span></span>
        </Link>
        <GoogleSignIn configured={google} label="Conectează-te cu Google" compact />
      </div>
    </header>
    <main className="mx-auto grid min-h-[calc(100svh-160px)] max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <section className="space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-cyan">PRIMUL 11 · 22 de analiști + redacția sportivă</p>
        <h1 className="font-display text-[clamp(2.8rem,8vw,5rem)] font-bold leading-[.98] tracking-tight">Analizează.<br /><span className="text-violet">Dezbate.</span><br />Decide.</h1>
        <p className="max-w-md text-base leading-relaxed text-muted">Intră în Primul 11 cu contul tău Google pentru a accesa meciurile, analizele și biletele create de comunitate.</p>
        {!google && <p role="status" className="text-sm text-gold">Conectarea cu Google este momentan indisponibilă.</p>}
        <Link href="/login" className="inline-flex rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-muted hover:border-cyan/50 hover:text-text">Am un cod de acces</Link>
      </section>
      <section aria-label="Echipa Primul 11" className="card p-6 sm:p-8">
        <div className="mb-6 flex items-baseline justify-between gap-3"><h2 className="font-display text-xl font-bold">Echipa Primul 11</h2><span className="text-xs text-muted">Perspective diferite.</span></div>
        <div className="grid grid-cols-4 gap-x-3 gap-y-5 sm:grid-cols-6">
          {agents.map(([id, agent]) => <div key={id} className="min-w-0 text-center"><img src={agent.img} alt="" width={64} height={64} loading="lazy" className="mx-auto aspect-square w-full max-w-16 rounded-full border-2 object-cover" style={{ borderColor: agent.accent }} /><p className="mt-2 text-[10px] leading-tight text-muted">{agent.name}</p></div>)}
        </div>
      </section>
    </main>
    <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4 pb-6 text-xs text-muted"><span>18+ · Analizele nu garantează rezultatele și nu plasează pariuri.</span><Link href="/confidentialitate" className="hover:text-text">Confidențialitate</Link><Link href="/termeni" className="hover:text-text">Termeni</Link></footer>
  </>;
}
