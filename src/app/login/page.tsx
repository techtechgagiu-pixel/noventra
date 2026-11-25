import { redirect } from 'next/navigation';
import { authConfigured, currentUser, loginDestination } from '@/lib/auth';
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  rate: 'Prea multe încercări. Așteaptă un minut și încearcă din nou.',
  invalid: 'Cod invalid.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; cod?: string; next?: string }> }) {
  const { error, cod, next } = await searchParams;
  if (await currentUser()) redirect(loginDestination(next));
  const custom = next === 'custom';
  const codes = authConfigured();
  const codeError = error === 'invalid' || (error === 'rate' && cod === '1');
  return <main className="flex min-h-screen items-center justify-center px-5 py-12">
    <section className="card w-full max-w-md space-y-7 p-8">
      <div className="flex items-center gap-3"><img src="/logo.svg" alt="" className="h-12 w-12" /><span className="app-wordmark">TREI <b>PUNCTE</b></span></div>
      <div>
        <p className="mb-2 text-sm text-muted">3 modele AI mari care dezbat fiecare meci</p>
        <h1 className="font-display text-[2.4rem] font-bold leading-none">{custom ? 'Un pas până la biletul tău.' : 'Site privat.'}</h1>
        <p className="mt-3 text-sm text-muted">{custom ? 'Conectează-te, apoi alegi cota, meciurile și agenții. Analiza pornește numai când apeși „Pornește dezbaterea”.' : 'Intră cu codul de acces.'}</p>
      </div>
            <div className="rounded-xl border border-line p-4">
        <form action="/auth/invite" method="post" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={custom ? 'custom' : ''} />
          <label className="block text-sm font-semibold" htmlFor="code">Cod de acces</label>
          <input id="code" name="code" type="password" autoComplete="off" autoCapitalize="characters" spellCheck={false} required minLength={20} maxLength={100} placeholder="P11-…" className="w-full rounded-xl border border-line bg-ink p-3 font-mono text-text focus:border-cyan focus:outline-none" />
          {codeError && <p role="alert" className="text-sm text-gold">{ERRORS[error!]}</p>}
          <button disabled={!codes} className="btn btn-primary w-full px-4 py-3 disabled:opacity-50">INTRĂ CU CODUL</button>
        </form>
      </div>
      <p className="text-xs leading-relaxed text-muted">18+ · <a href="/confidentialitate" className="text-cyan">Confidențialitate</a> · <a href="/termeni" className="text-cyan">Termeni</a></p>
    </section>
  </main>;
}
