'use client';
import { useState } from 'react';
import { api } from '@/lib/format';
export function SettingsForm({ initial }: { initial: { soundEnabled: boolean; soundVolume: number } }) {
  const [s, setS] = useState(initial); const [saved, setSaved] = useState(false);
  const [rm, setRm] = useState(false);
  const save = async (next: typeof s) => { setS(next); await api('/api/settings', { method: 'POST', body: JSON.stringify(next) }).catch(() => {}); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  return (
    <div className="card space-y-4 p-5">
      <label className="flex items-center justify-between gap-4"><span><span className="font-semibold">Sunet NEXUS</span><br /><span className="text-xs text-muted">Oprit implicit. Pornește doar după un clic, numai cât lucrează un job real.</span></span><input type="checkbox" checked={s.soundEnabled} onChange={(e) => save({ ...s, soundEnabled: e.target.checked })} className="h-5 w-5 accent-cyan" /></label>
      <label className="block"><span className="text-sm">Volum principal: {s.soundVolume}%</span><input type="range" min={0} max={100} value={s.soundVolume} onChange={(e) => setS({ ...s, soundVolume: Number(e.target.value) })} onMouseUp={() => save(s)} onTouchEnd={() => save(s)} className="w-full accent-cyan" /></label>
      <label className="flex items-center justify-between gap-4"><span><span className="font-semibold">Mișcare redusă</span><br /><span className="text-xs text-muted">Oprește animațiile NEXUS pe acest dispozitiv.</span></span><input type="checkbox" checked={rm} onChange={(e) => { setRm(e.target.checked); document.documentElement.classList.toggle('reduce-motion', e.target.checked); try { localStorage.setItem('bm-rm', e.target.checked ? '1' : '0'); } catch {} }} className="h-5 w-5 accent-cyan" /></label>
      {saved && <p className="text-xs text-emerald">Salvat.</p>}
    </div>
  );
}
