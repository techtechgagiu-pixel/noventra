import { redirect } from 'next/navigation';
import { currentUser, authConfigured } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const ERRORS: Record<string, string> = { config: 'Autentificarea Google nu este configurată pe server.', failed: 'Autentificarea nu a reușit. Încearcă din nou.', denied: 'Autentificarea a fost anulată.' };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser().catch(() => null)) redirect('/dashboard');
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <img src="/favicon.svg" alt="" className="mx-auto h-14 w-14" />
        <h1 className="mt-4 font-display text-3xl font-bold">PRIMUL 11</h1>
        <p className="mt-2 text-muted">Conectează-te pentru a-ți crea și păstra biletele.</p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose/10 p-3 text-sm text-rose">{ERRORS[error] ?? 'Eroare la autentificare.'}</p>}
        <a href="/auth/google" className={`btn btn-primary mt-6 w-full py-4 text-base ${authConfigured() ? '' : 'pointer-events-none opacity-50'}`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden><path fill="#04121a" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#04121a" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" opacity=".7"/><path fill="#04121a" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z" opacity=".5"/><path fill="#04121a" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.8 9.4 6 12 6Z" opacity=".85"/></svg>
          Continuă cu Google
        </a>
        <p className="mt-4 text-xs text-muted">Cerem doar numele, e-mailul și poza de profil (openid, email, profile). Nu accesăm Gmail.</p>
      </div>
    </main>
  );
}
