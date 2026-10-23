import { redirect } from 'next/navigation';
import { GoogleSignIn } from '@/components/google-sign-in';
import { authConfigured, currentUser, googleConfigured, loginDestination } from '@/lib/auth';
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  rate: 'Prea multe încercări. Așteaptă un minut și încearcă din nou.',
  invalid: 'Cod invalid, expirat sau revocat.',
  google: 'Conectarea cu Google nu a reușit. Încearcă din nou.',
  'google-denied': 'Conectarea cu Google a fost anulată.',
  blocked: 'Acest cont a fost blocat de administrator.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; cod?: string; next?: string }> }) {
  const { error, cod, next } = await searchParams;
  if (await currentUser()) redirect(loginDestination(next));
  const custom = next === 'custom';
  const google = googleConfigured();
  const codes = authConfigured();
  const codeError = error === 'invalid' || (error === 'rate' && cod === '1');
  return <main className="flex min-h-screen items-center justify-center px-5 py-12">
    <section className="card w-full max-w-md space-y-7 p-8">
      <div className="flex items-center gap-3"><img src="/logo.svg" alt="" className="h-12 w-12" /><span className="font-display text-2xl font-bold">PRIMUL <span className="text-cyan">11</span></span></div>
      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-cyan">22 de agenți AI · dezbatere live</p>
        <h1 className="font-display text-3xl font-bold">{custom ? 'Un pas până la biletul tău.' : 'Bine ai venit în echipă.'}</h1>
        <p className="mt-3 text-sm text-muted">{custom ? 'Conectează-te, apoi alegi cota, meciurile și agenții. Analiza pornește numai când apeși „Pornește dezbaterea”.' : 'Intră cu contul tău Google. Biletele create de toată lumea apar la „Bilete create”, cu numele celui care le-a făcut.'}</p>
      </div>
      {error && !codeError && <p role="alert" className="text-sm text-gold">{ERRORS[error] ?? ERRORS.google}</p>}
      <GoogleSignIn configured={google} custom={custom} />
      {!google && <p role="alert" className="text-sm text-gold">Conectarea cu Google se configurează. Revino în curând.</p>}
      <details className="group rounded-xl border border-line p-4" open={codeError}>
        <summary className="cursor-pointer text-sm font-semibold text-muted group-open:text-text">Am un cod de acces (administrator sau invitație)</summary>
        <form action="/auth/invite" method="post" className="mt-4 space-y-3">
          <input type="hidden" name="next" value={custom ? 'custom' : ''} />
          <label className="block text-sm font-semibold" htmlFor="code">Cod de acces</label>
          <input id="code" name="code" type="password" autoComplete="off" autoCapitalize="characters" spellCheck={false} required minLength={20} maxLength={100} placeholder="P11-…" className="w-full rounded-xl border border-line bg-ink p-3 font-mono text-text focus:border-cyan focus:outline-none" />
          {codeError && <p role="alert" className="text-sm text-gold">{ERRORS[error!]}</p>}
          <button disabled={!codes} className="w-full rounded-xl bg-cyan px-4 py-3 font-bold text-ink disabled:opacity-50">INTRĂ CU CODUL</button>
        </form>
      </details>
      <p className="text-xs leading-relaxed text-muted">Administrarea se face doar cu codul de administrator. Contul Google îți dă acces la crearea și urmărirea biletelor. 18+ · <a href="/confidentialitate" className="text-cyan">Confidențialitate</a> · <a href="/termeni" className="text-cyan">Termeni</a></p>
    </section>
  </main>;
}
