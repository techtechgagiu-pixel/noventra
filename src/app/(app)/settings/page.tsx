import { currentUser } from '@/lib/auth';
import { SettingsForm } from '@/components/settings-form';
export const dynamic = 'force-dynamic';
export default async function Settings() {
  const u = (await currentUser())!;
  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="font-display text-3xl font-bold">Setări</h1>
      <div className="card p-5"><p className="text-sm text-muted">Cont Google</p><p className="font-semibold">{u.name} · {u.email}</p><p className="mt-1 text-xs text-muted">Rol: {u.role === 'admin' ? 'administrator' : 'utilizator'}</p></div>
      <SettingsForm initial={{ soundEnabled: u.soundEnabled, soundVolume: u.soundVolume }} />
      <div className="card p-5 text-sm text-muted"><p className="font-semibold text-text">Cum funcționează</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>Fiecare bilet zilnic se poate crea o dată pe zi (ora României); biletul săptămânii o dată pe săptămână (de luni).</li><li>Agenții AI rulează doar după ce apeși CREEAZĂ BILETUL. Replay-ul nu rulează AI.</li><li>Cotele sunt cele observate la creare, de la ESPN (DraftKings). Nu plasăm pariuri.</li></ul></div>
      <form action="/auth/logout" method="post"><button className="btn btn-ghost px-5 py-3">Deconectare</button></form>
    </div>
  );
}
