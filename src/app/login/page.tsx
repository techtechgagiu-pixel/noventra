import { redirect } from 'next/navigation';
import { authConfigured, currentUser, googleConfigured } from '@/lib/auth';
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  rate: 'Prea multe încercări. Așteaptă un minut și încearcă din nou.',
  invalid: 'Cod invalid, expirat sau revocat.',
  google: 'Conectarea cu Google nu a reușit. Încearcă din nou.',
  'google-denied': 'Conectarea cu Google a fost anulată.',
  blocked: 'Acest cont a fost blocat de administrator.',
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; cod?: string }> }) {
  if (await currentUser()) redirect('/');
  const { error, cod } = await searchParams;
  const google = googleConfigured();
  const codes = authConfigured();
  const codeError = error === 'invalid' || (error === 'rate' && cod === '1');
  return <main className="flex min-h-screen items-center justify-center px-5 py-12">
    <section className="card w-full max-w-md space-y-7 p-8">
      <div className="flex items-center gap-3"><img src="/logo.svg" alt="" className="h-12 w-12" /><span className="font-display text-2xl font-bold">PRIMUL <span className="text-cyan">11</span></span></div>
      <div>
        <p className="mb-2 text-xs uppercase tracking-widest text-cyan">22 de agenți AI · dezbatere live</p>
        <h1 className="font-display text-3xl font-bold">Bine ai venit în echipă.</h1>
        <p className="mt-3 text-sm text-muted">Intră cu contul tău Google. Biletele create de toată lumea apar la „Bilete create”, cu numele celui care le-a făcut.</p>
      </div>
      {error && !codeError && <p role="alert" className="text-sm text-gold">{ERRORS[error] ?? ERRORS.google}</p>}
      <a href="/auth/google" aria-disabled={!google} className={`flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-bold text-[#1f1f1f] ${google ? 'hover:bg-white/90' : 'pointer-events-none opacity-50'}`}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continuă cu Google
      </a>
      {!google && <p role="alert" className="text-sm text-gold">Conectarea cu Google se configurează. Revino în curând.</p>}
      <details className="group rounded-xl border border-line p-4" open={codeError}>
        <summary className="cursor-pointer text-sm font-semibold text-muted group-open:text-text">Am un cod de acces (administrator sau invitație)</summary>
        <form action="/auth/invite" method="post" className="mt-4 space-y-3">
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
