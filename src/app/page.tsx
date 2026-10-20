import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const AGENTS = ['victor', 'andrei', 'mihai', 'alex', 'diana', 'robert', 'ioana', 'radu', 'elena', 'cosmin', 'hantu'];

export default async function Home() {
  if (await currentUser().catch(() => null)) redirect('/dashboard');
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-4 py-16">
      <div className="flex items-center gap-3 font-display text-xl font-bold"><img src="/favicon.svg" alt="" className="h-10 w-10" /> PRIMUL <span className="text-cyan">11</span></div>
      <div className="max-w-3xl">
        <p className="chip mb-5 text-cyan">NEXUS 5.0</p>
        <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">Primul 11 votează.<br />Tu câștigi timp.</h1>
        <p className="mt-6 max-w-xl text-lg text-muted">Șase analiști AI studiază meciuri reale din 10 ligi europene, dezbat, votează și construiesc un bilet — sau îți spun sincer că azi nu merită.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="btn btn-primary px-7 py-4 text-base">Intră cu Google</Link>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2 md:grid-cols-11 md:gap-3" aria-hidden>
        {AGENTS.map((a) => <img key={a} src={`/agents/${a}.webp`} alt="" className="aspect-[1/2] w-full rounded-2xl border border-line object-cover opacity-90" />)}
      </div>
      <p className="text-xs text-muted">18+ · Nu garantăm rezultate și nu plasăm pariuri.</p>
    </main>
  );
}
