'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, ListOrdered, Loader2 } from 'lucide-react';
import { AGENT_META, STATUS_RO, api } from '@/lib/format';
import type { QueueItem } from '@/lib/jobs/service';

const STAGE: Record<string, string> = { QUEUED: 'așteaptă să înceapă', SELECTING: 'alege meciurile', SCOUT: 'adună istoric și știri', STATS: 'calculează statistici', ANALYSIS: 'agenții analizează', DEBATE: 'agenții dezbat', VOTING: 'votează · creierul alege', BUILDING: 'construiește biletul', DONE: 'gata' };
const ACTIVE = ['QUEUED', 'RUNNING', 'WAITING', 'PAUSED'];
const ago = (iso: string, now: number) => { if (!now) return '…'; const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; };

/** Live queue of analyses: what is running, what waits its turn (max 2 at once) and what just finished. */
export function JobQueue({ initial, onlyCustom = false }: { initial: QueueItem[]; onlyCustom?: boolean }) {
  const [items, setItems] = useState(initial);
  const [now, setNow] = useState(0); // set after mount: server and browser clocks differ (hydration)
  const active = items.some((i) => ACTIVE.includes(i.status));

  useEffect(() => {
    let stop = false;
    const load = async () => { try { const r = await api<{ queue: QueueItem[] }>('/api/queue'); if (!stop) setItems(r.queue); } catch { /* keep last state */ } };
    const t = setInterval(load, active ? 4000 : 20000);
    setNow(Date.now());
    const c = setInterval(() => setNow(Date.now()), 1000);
    return () => { stop = true; clearInterval(t); clearInterval(c); };
  }, [active]);

  const list = onlyCustom ? items.filter((i) => i.custom) : items;
  if (!list.length) return null;
  const running = list.filter((i) => ACTIVE.includes(i.status)).length;
  return (
    <section className="card p-4" aria-label="Coada analizelor">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ListOrdered size={18} className="text-cyan" aria-hidden />
        <h3 className="font-display text-base font-bold">Coada analizelor</h3>
        <span className="text-xs text-muted">{running ? `${running} în lucru · maximum 2 rulează deodată, restul își așteaptă rândul` : 'nimic în lucru acum · ultimele 2 ore'}</span>
      </div>
      <ul className="space-y-2">
        {list.map((i) => {
          const live = ACTIVE.includes(i.status);
          const pct = i.status === 'QUEUED' ? 0 : !live ? 100 : i.batches ? Math.min(98, Math.round(((i.batch - 1) / i.batches) * 100 + 100 / i.batches / 2)) : 5;
          const href = i.custom ? `/?tab=custom&job=${i.id}` : i.review ? `/?tab=verifica&job=${i.id}` : !live && i.ticketId ? `/?tab=bilete&ticket=${i.ticketId}` : `/?tab=analiza&job=${i.id}`;
          const tone = i.status === 'PAUSED' || i.status === 'WAITING' ? 'text-gold' : i.status === 'RUNNING' ? 'text-emerald' : i.status === 'QUEUED' ? 'text-cyan' : i.generation === 'COMPLETED' ? 'text-emerald' : 'text-muted';
          return (
            <li key={i.id}>
              <Link href={href} className="card-soft flex items-center gap-3 p-3 transition hover:border-cyan/50">
                {i.agents?.length ? (
                  <div className="flex shrink-0 -space-x-2">{i.agents.slice(0, 3).map((a) => <img key={a} src={AGENT_META[a]?.img} alt="" className="h-7 w-7 rounded-full border-2 border-ink object-cover" />)}{i.agents.length > 3 && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-panel-2 text-[10px] font-bold">+{i.agents.length - 3}</span>}</div>
                ) : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-2">{live ? <Loader2 size={14} className="animate-spin text-cyan" aria-hidden /> : <Clock size={14} className="text-muted" aria-hidden />}</span>}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                    <span className="truncate">{i.title}</span>
                    <span className={`text-xs font-semibold ${tone}`}>{i.status === 'QUEUED' && i.position ? `#${i.position} la rând` : STATUS_RO[i.status] ?? i.status}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {live ? <>{STAGE[i.stage] ?? i.stage}{i.batches ? ` · lot ${Math.max(1, i.batch)}/${i.batches}` : ''}{i.analyzed ? ` · ${i.analyzed} meciuri analizate` : ''} · de {ago(i.createdAt, now)}</>
                      : <>{i.generation === 'COMPLETED' && i.actualOdds ? `bilet cotă ${i.actualOdds.toFixed(2)}` : i.generation === 'NO_BET' ? 'NO BET' : i.generation === 'INCOMPLETE' ? 'incomplet' : STATUS_RO[i.status]} · terminat acum {ago(i.finishedAt ?? i.createdAt, now)}</>}
                  </p>
                  {i.status === 'PAUSED' && i.lastError && <p className="mt-0.5 truncate text-xs text-gold">{i.lastError}</p>}
                  {live && <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full transition-all duration-700 ${i.status === 'QUEUED' ? 'indeterminate' : 'bg-gradient-to-r from-cyan to-emerald'}`} style={i.status === 'QUEUED' ? undefined : { width: `${pct}%` }} /></div>}
                </div>
                <span className="shrink-0 text-xs text-cyan">{live ? 'vezi live →' : 'deschide →'}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
