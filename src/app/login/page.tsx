import { redirect } from 'next/navigation';
import { authConfigured, currentUser } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect('/');
  const { error } = await searchParams;
  const ready = authConfigured();
  return <main className="flex min-h-screen items-center justify-center px-5 py-12">
    <section className="card w-full max-w-md space-y-7 p-8">
      <div className="flex items-center gap-3"><img src="/logo.svg" alt="" className="h-12 w-12" /><span className="font-display text-2xl font-bold">PRIMUL <span className="text-cyan">11</span></span></div>
      <div><p className="mb-2 text-xs uppercase tracking-widest text-cyan">Acces pe bază de invitație</p><h1 className="font-display text-3xl font-bold">Bine ai venit în echipă.</h1><p className="mt-3 text-sm text-muted">Introdu codul primit pentru a intra. Fără cont, fără e-mail.</p></div>
      <form action="/auth/invite" method="post" className="space-y-4">
        <label className="block text-sm font-semibold" htmlFor="code">Cod de invitație</label>
        <input id="code" name="code" type="password" autoComplete="off" autoCapitalize="characters" spellCheck={false} required minLength={20} maxLength={100} placeholder="P11-…" className="w-full rounded-xl border border-line bg-ink p-3 font-mono text-text focus:border-cyan focus:outline-none" />
        {error && <p role="alert" className="text-sm text-gold">{error === 'rate' ? 'Prea multe încercări. Așteaptă un minut și încearcă din nou.' : 'Cod invalid, expirat sau revocat. Verifică-l ori cere o invitație nouă.'}</p>}
        {!ready && <p role="alert" className="text-sm text-gold">Accesul se configurează. Revino în curând.</p>}
        <button disabled={!ready} className="w-full rounded-xl bg-cyan px-4 py-3 font-bold text-ink disabled:opacity-50">INTRĂ ÎN PRIMUL 11</button>
      </form>
      <p className="text-xs leading-relaxed text-muted">Invitațiile pentru vizitatori sunt valabile 7 zile de la emitere. Codul administratorului nu expiră.</p>
    </section>
  </main>;
}
