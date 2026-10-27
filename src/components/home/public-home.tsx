import Link from 'next/link';
import { AGENT_META } from '@/lib/format';
import { GoogleSignIn } from '@/components/google-sign-in';
import { HomeIntro, HowItWorks } from './home-intro';

/** Public explanation only: no account data, database reads, polling or inference. */
export function PublicHome({ google, unavailable = false }: { google: boolean; unavailable?: boolean }) {
  const migrationPreview = process.env.BETMIND_RUNTIME === 'cloudflare-preview';
  const agents = Object.entries(AGENT_META);
  return <>
    <header className="app-header">
      {migrationPreview && <p role="status" className="border-b border-cyan/30 bg-cyan/10 px-4 py-2 text-center text-xs text-cyan">Previzualizare pentru migrare · doar prezentarea este activă. Biletele și autentificarea nu sunt încă disponibile aici.</p>}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" aria-label="Primul 11 — Acasă" className="flex items-center gap-2.5"><img src="/logo.svg" alt="" className="h-8 w-8" /><span className="app-wordmark">PRIMUL <b>11</b></span></Link>
        <GoogleSignIn configured={google} label="Conectează-te cu Google" compact />
      </div>
    </header>
    <main className="home-page mx-auto max-w-6xl px-4 pb-16 pt-8 sm:pt-12">
      {unavailable && <p role="status" className="mb-6 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm text-gold">Biletele și conectarea sunt temporar indisponibile din cauza limitei serviciului de date. Poți consulta în continuare prezentarea aplicației.</p>}
      <HomeIntro />
      {!google && <p role="status" className="mt-4 text-sm text-gold">Conectarea cu Google este momentan indisponibilă. Poți folosi un cod de acces.</p>}
      <HowItWorks />
      <section className="home-team" aria-labelledby="home-team-title"><div className="home-section-heading"><h2 id="home-team-title">Modele AI diferite. O singură echipă de analiză.</h2><p>Prudenți, tacticieni, contrarieni și oameni de știri. Fiecare rol vine cu alte argumente și alte limite de risc.</p></div>
        <div className="home-team-grid">{agents.map(([id, a]) => <div key={id}><img src={a.img} alt="" width={56} height={56} loading="lazy" style={{ borderColor: a.accent }} /><strong>{a.name}</strong><span>{a.title}</span></div>)}</div>
        <p className="mt-5 text-xs leading-relaxed text-muted">Fiecare model are un rol și o metodă de analiză. Portretele sunt ilustrative; argumentele sunt generate din datele disponibile.</p>
      </section>
      <div className="home-bottom-action"><div><h2>Tu alegi direcția. Ei o pun la încercare.</h2><p>Configurezi biletul înainte să pornești dezbaterea.</p></div><Link href="/login?next=custom" className="btn btn-primary px-5 py-3">Creează bilet custom</Link><Link href="/login?next=custom" className="text-sm text-muted underline underline-offset-4">Am un cod de acces</Link></div>
    </main>
    <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4 pb-6 text-xs text-muted"><span>18+ · Analizele nu garantează rezultatele și nu plasează pariuri.</span><Link href="/confidentialitate" className="hover:text-text">Confidențialitate</Link><Link href="/termeni" className="hover:text-text">Termeni</Link></footer>
  </>;
}
