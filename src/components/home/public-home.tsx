import Link from 'next/link';
import { AGENT_META } from '@/lib/format';
import { GoogleSignIn } from '@/components/google-sign-in';
import { HowItWorks } from './home-intro';
import { DebatePreview } from './debate-preview';
import { HOME_EXAMPLE, HOME_EXAMPLE_MODELS } from '@/lib/home-example';
import { publicProof, type PublicProof } from '@/lib/public-proof';

const odds = (n: number) => n.toFixed(2);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const day = (iso: string) => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', timeZone: 'Europe/Bucharest' }).format(new Date(iso));

/** Logged-out home: what the app does in one look, real results as proof, one way in (Google). No account data. */
export async function PublicHome({ google, unavailable = false }: { google: boolean; unavailable?: boolean }) {
  const migrationPreview = process.env.BETMIND_RUNTIME === 'cloudflare-preview';
  const agents = Object.entries(AGENT_META);
  const proof = unavailable || migrationPreview ? null : await publicProof();
  return <>
    <header className="app-header">
      {migrationPreview && <p role="status" className="border-b border-cyan/30 bg-cyan/10 px-4 py-2 text-center text-xs text-cyan">Previzualizare pentru migrare · doar prezentarea este activă. Biletele și autentificarea nu sunt încă disponibile aici.</p>}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label="Primul 11 — Acasă" className="flex items-center gap-2.5"><img src="/logo.svg" alt="" className="h-8 w-8" /><span className="app-wordmark">PRIMUL <b>11</b></span></Link>
        <GoogleSignIn configured={google} label="Intră cu Google" compact />
      </div>
    </header>
    <main className="home-page mx-auto max-w-6xl px-4 pb-16 pt-8 sm:pt-12">
      {unavailable && <p role="status" className="mb-6 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm text-gold">Biletele și conectarea sunt temporar indisponibile din cauza limitei serviciului de date. Poți consulta în continuare prezentarea aplicației.</p>}
      <PublicHero google={google} proof={proof} />
      <HowItWorks />
      <section className="home-process" aria-labelledby="home-debate-title"><div className="home-section-heading"><h2 id="home-debate-title">Cum arată o dezbatere.</h2><p>Un fragment dintr-o analiză: argument, contradicție, decizie.</p></div><div className="mt-6 max-w-3xl"><DebatePreview thread={HOME_EXAMPLE} models={HOME_EXAMPLE_MODELS} /></div></section>
      <section className="home-team" aria-labelledby="home-team-title"><div className="home-section-heading"><h2 id="home-team-title">Modele AI diferite. O singură echipă de analiză.</h2><p>Prudenți, tacticieni, contrarieni și oameni de știri. Fiecare rol vine cu alte argumente și alte limite de risc.</p></div>
        <div className="home-team-grid">{agents.map(([id, a]) => <div key={id}><img src={a.img} alt="" width={56} height={56} loading="lazy" style={{ borderColor: a.accent }} /><strong>{a.name}</strong><span>{a.title}</span></div>)}</div>
        <p className="mt-5 text-xs leading-relaxed text-muted">Fiecare model are un rol și o metodă de analiză. Portretele sunt ilustrative; argumentele sunt generate din datele disponibile.</p>
      </section>
      <div className="home-bottom-action"><div><h2>Tu alegi direcția. Ei o pun la încercare.</h2><p>Intri cu contul Google, alegi cota și pornești dezbaterea.</p></div><div className="w-full sm:w-auto"><GoogleSignIn configured={google} label="Intră cu Google" /></div><Link href="/login?next=custom" className="text-sm text-muted underline underline-offset-4">Am un cod de acces</Link></div>
    </main>
    <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4 pb-6 text-xs text-muted"><span>18+ · Analizele nu garantează rezultatele și nu plasează pariuri.</span><Link href="/confidentialitate" className="hover:text-text">Confidențialitate</Link><Link href="/termeni" className="hover:text-text">Termeni</Link></footer>
  </>;
}

function PublicHero({ google, proof }: { google: boolean; proof: PublicProof | null }) {
  const won = proof?.lastWon;
  return <section className="public-hero" aria-labelledby="home-title">
    <div className="public-hero-copy">
      <p className="public-eyebrow">Analiză de fotbal cu agenți AI</p>
      <h1 id="home-title">Agenții dezbat. <em>Tu primești biletul.</em></h1>
      <p className="public-lead">Alegi cota și numărul de meciuri. Agenții citesc cotele, forma echipelor și știrile zilei, se contrazic, apoi votează. Pe bilet ajung doar selecțiile susținute de echipă.</p>
      <div className="public-cta"><GoogleSignIn configured={google} label="Intră cu Google" /></div>
      {google
        ? <p className="public-cta-note">Gratuit, fără card. <Link href="/login?next=custom">Am un cod de acces</Link></p>
        : <p role="status" className="public-cta-note text-gold">Conectarea cu Google este momentan indisponibilă. <Link href="/login?next=custom">Intră cu un cod de acces</Link></p>}
    </div>
    {won && proof ? <aside className="public-proof" aria-labelledby="proof-title">
      <div className="slip" data-result="WON">
        <div className="flex items-start justify-between gap-3">
          <div><p id="proof-title" className="public-proof-kicker">Ultimul bilet câștigat</p><p className="mt-1 text-xs text-muted">închis pe {day(won.settledAt)} · {won.legs.length} meciuri</p></div>
          <div className="text-right"><p className="board-num text-[2.6rem]">{odds(won.odds)}</p><p className="mt-1 text-xs text-muted">cota totală</p></div>
        </div>
        <ul className="public-proof-legs">{won.legs.map((l, i) => <li key={i}>
          <div className="min-w-0"><p className="truncate font-semibold">{l.home} – {l.away}</p><p className="truncate text-xs text-muted">{l.label}</p></div>
          <div className="shrink-0 text-right"><p className="font-display text-lg font-bold">{l.homeScore != null && l.awayScore != null ? `${l.homeScore}-${l.awayScore}` : '—'}</p><p className="text-xs text-emerald">✓ {odds(l.odds)}</p></div>
        </li>)}</ul>
      </div>
      <dl className="public-proof-stats">
        <div><dt>Selecții câștigate</dt><dd><span className="board-num">{pct(proof.picks.won, proof.picks.decided)}%</span> <small>{proof.picks.won} din {proof.picks.decided}</small></dd></div>
      </dl>
      <p className="public-proof-note">Date reale din istoricul aplicației, la cotele din momentul analizei. Rezultatele trecute nu garantează rezultate viitoare.</p>
    </aside> : <aside className="public-proof public-proof-empty"><p className="board-num text-[7rem]">11</p><p className="mt-3 font-display text-xl font-bold">Primul 11 votează. Tu câștigi timp.</p></aside>}
  </section>;
}
