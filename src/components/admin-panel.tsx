'use client';
import { useCallback, useEffect, useState } from 'react';

type Job = { id: string; userId: string; email: string; slot: string; status: string; stage: string; target: number; legs: number | null; createdAt: string; startedAt: string | null; batch: number; batches: number; analyzed: number };
type Acc = { id: string; email: string; name: string | null; role: string; blocked_at: string | null; last_login_at: string | null; balance: number | null; founder: number | null };
type Usage = { days: { provider: string; day: string; requests: number; tokens: number; errors: number }[]; limits: { calls: number; tokens: number; concurrent: number } };
type Pay = { recent: { id: number; email: string; delta: number; reason: string; ref: string; created_at: string }[]; day: { reason: string; credits: number; n: number }[] };
type Data = { queue: Job[]; accounts: Acc[]; usage: Usage; payments: Pay };

const TABS = [['queue', 'Coadă live'], ['accounts', 'Conturi și credite'], ['usage', 'Consum AI'], ['pay', 'Plăți']] as const;
const REASON: Record<string, string> = { purchase: 'plată', charge: 'bilet', refund: 'rambursare', grant: 'cadou', admin: 'admin' };
const ago = (iso: string | null, now: number) => { if (!iso) return '—'; const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}z`; };

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const d = await r?.json().catch(() => ({})) as { error?: string } | undefined;
  if (!r?.ok) throw new Error(d?.error ?? 'Nu am putut salva.');
}

export function AdminPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('queue');
  const [data, setData] = useState<Data | null>(null);
  const [now, setNow] = useState(0);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState('');
  const [q, setQ] = useState('');
  const load = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    const r = await fetch('/api/admin/panel', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) { setData(await r.json() as Data); setNow(Date.now()); }
  }, []);
  useEffect(() => { void load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  async function act(key: string, fn: () => Promise<void>, ask = false) {
    if (ask && confirm !== key) { setConfirm(key); return; }
    setConfirm(''); setMsg('');
    try { await fn(); await load(); setMsg('Salvat.'); } catch (e) { setMsg((e as Error).message); }
  }
  if (!data) return <p className="text-sm text-muted" role="status">Se încarcă…</p>;
  const byUser = new Map<string, Job[]>();
  data.queue.forEach((j) => byUser.set(j.email, [...(byUser.get(j.email) ?? []), j]));
  const running = data.queue.filter((j) => j.startedAt && j.status !== 'PAUSED').length;
  const waiting = data.queue.filter((j) => !j.startedAt).length;
  const accounts = data.accounts.filter((a) => !q || a.email.toLowerCase().includes(q.toLowerCase()) || (a.name ?? '').toLowerCase().includes(q.toLowerCase()));
  const today = new Map(data.payments.day.map((d) => [d.reason, d]));
  const todayUsage = data.usage.days.filter((d) => d.day === data.usage.days[0]?.day);
  const calls = todayUsage.reduce((a, d) => a + d.requests, 0), tokens = todayUsage.reduce((a, d) => a + d.tokens, 0);
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2" role="tablist">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`chip ${tab === id ? 'border-cyan text-cyan' : 'text-muted'}`}>{label}{id === 'queue' && data.queue.length ? ` (${data.queue.length})` : ''}</button>)}</div>
    {msg && <p role="status" className="text-sm text-gold">{msg}</p>}

    {tab === 'queue' && <section className="space-y-3">
      <p className="text-sm text-muted">{running} în lucru · {waiting} la rând · maxim {data.usage.limits.concurrent} în paralel. Se actualizează la 5 secunde.</p>
      {!data.queue.length && <div className="card p-4 text-sm text-muted">Nicio analiză activă acum.</div>}
      {[...byUser.entries()].map(([email, jobs]) => <div key={email} className="card p-4">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{email}</strong><span className="text-xs text-muted">{jobs.length} bilet{jobs.length === 1 ? '' : 'e'}</span>
          <button className="btn btn-ghost ml-auto px-3 py-1 text-xs" onClick={() => act(`u:${jobs[0].userId}`, () => post('/api/admin/panel/cancel', { userId: jobs[0].userId }), true)}>{confirm === `u:${jobs[0].userId}` ? 'Sigur? Anulează toate' : 'Anulează toate'}</button></div>
        <ul className="mt-2 divide-y divide-line text-sm">{jobs.map((j) => <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
          <span className="tabular text-muted">{j.slot}</span>
          <span className={j.startedAt ? 'text-cyan' : 'text-gold'}>{j.startedAt ? `în lucru · ${j.stage}` : 'la rând'}</span>
          <span className="text-muted">cota {j.target}{j.legs ? ` · ${j.legs} meciuri` : ''}{j.batches ? ` · lot ${j.batch}/${j.batches}` : ''}{j.analyzed ? ` · ${j.analyzed} analizate` : ''}</span>
          <span className="text-xs text-muted">de {ago(j.createdAt, now)}</span>
          <button className="btn btn-ghost ml-auto px-3 py-1 text-xs" onClick={() => act(`j:${j.id}`, () => post('/api/admin/panel/cancel', { jobId: j.id }), true)}>{confirm === `j:${j.id}` ? 'Sigur?' : 'Anulează'}</button></li>)}</ul>
      </div>)}
    </section>}

    {tab === 'accounts' && <section className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după email sau nume" aria-label="Caută cont" className="w-full max-w-sm rounded-xl border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-cyan" />
      <div className="card overflow-x-auto p-4"><table className="w-full text-sm"><thead className="text-left text-muted"><tr><th className="py-1">Cont</th><th>Credite</th><th>Ultima intrare</th><th>Acțiuni</th></tr></thead>
        <tbody>{accounts.map((a) => { const blocked = !!a.blocked_at; const free = a.founder === 1 || a.role === 'admin'; return <tr key={a.id} className="border-t border-line align-top">
          <td className="py-1.5"><div className="font-semibold">{a.name || a.email}</div><div className="text-xs text-muted">{a.name ? a.email : ''}{a.role === 'admin' ? ' · admin' : ''}{blocked ? ' · BLOCAT' : ''}</div></td>
          <td className="tabular">{a.balance ?? 0}{free ? <span className="ml-1 text-xs text-gold">gratuit</span> : null}</td>
          <td className="text-muted">{ago(a.last_login_at, now)}</td>
          <td><div className="flex flex-wrap gap-1.5">
            {[10, 60].map((n) => <button key={n} className="btn btn-ghost px-2 py-1 text-xs" onClick={() => act(`c+${a.id}${n}`, () => post('/api/admin/panel/credits', { userId: a.id, delta: n }))}>+{n}</button>)}
            <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => act(`c-${a.id}`, () => post('/api/admin/panel/credits', { userId: a.id, delta: -10 }), true)}>{confirm === `c-${a.id}` ? 'Sigur? −10' : '−10'}</button>
            <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => act(`f${a.id}`, () => post('/api/admin/panel/credits', { userId: a.id, founder: a.founder !== 1 }))}>{a.founder === 1 ? 'Taxează' : 'Fă gratuit'}</button>
            {a.role !== 'admin' && <button className="btn btn-ghost px-2 py-1 text-xs" onClick={() => act(`b${a.id}`, () => post('/api/admin/accounts', { id: a.id, blocked: !blocked }), !blocked)}>{blocked ? 'Deblochează' : confirm === `b${a.id}` ? 'Sigur? Blochează' : 'Blochează'}</button>}
          </div></td></tr>; })}</tbody></table></div>
    </section>}

    {tab === 'usage' && <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-muted">Apeluri AI azi</p><p className="font-display text-2xl font-bold tabular">{calls}<span className="text-sm text-muted"> / {data.usage.limits.calls}</span></p></div>
        <div className="card p-4"><p className="text-xs text-muted">Tokeni azi</p><p className="font-display text-2xl font-bold tabular">{tokens.toLocaleString('ro-RO')}<span className="text-sm text-muted"> / {data.usage.limits.tokens.toLocaleString('ro-RO')}</span></p></div>
        <div className="card p-4"><p className="text-xs text-muted">Analize în paralel</p><p className="font-display text-2xl font-bold tabular">{running} / {data.usage.limits.concurrent}</p></div>
      </div>
      <div className="card overflow-x-auto p-4"><table className="w-full text-sm"><thead className="text-left text-muted"><tr><th className="py-1">Zi (UTC)</th><th>Furnizor</th><th>Cereri</th><th>Tokeni</th><th>Erori</th></tr></thead>
        <tbody>{data.usage.days.map((u, i) => <tr key={i} className="border-t border-line"><td className="py-1.5">{String(u.day).slice(0, 10)}</td><td>{u.provider}</td><td className="tabular">{u.requests}</td><td className="tabular">{Number(u.tokens).toLocaleString('ro-RO')}</td><td className="tabular">{u.errors}</td></tr>)}</tbody></table></div>
    </section>}

    {tab === 'pay' && <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-muted">Credite cumpărate (24 h)</p><p className="font-display text-2xl font-bold tabular">{today.get('purchase')?.credits ?? 0}<span className="text-sm text-muted"> · {today.get('purchase')?.n ?? 0} plăți</span></p></div>
        <div className="card p-4"><p className="text-xs text-muted">Credite folosite pe bilete (24 h)</p><p className="font-display text-2xl font-bold tabular">{Math.abs(today.get('charge')?.credits ?? 0)}<span className="text-sm text-muted"> · {today.get('charge')?.n ?? 0} bilete</span></p></div>
        <div className="card p-4"><p className="text-xs text-muted">Rambursate (24 h)</p><p className="font-display text-2xl font-bold tabular">{today.get('refund')?.credits ?? 0}</p></div>
      </div>
      <div className="card overflow-x-auto p-4"><table className="w-full text-sm"><thead className="text-left text-muted"><tr><th className="py-1">Acum</th><th>Cont</th><th>Tip</th><th>Credite</th><th>Referință</th></tr></thead>
        <tbody>{data.payments.recent.map((r) => <tr key={r.id} className="border-t border-line"><td className="py-1.5 text-muted">{ago(r.created_at, now)}</td><td>{r.email}</td><td>{REASON[r.reason] ?? r.reason}{r.reason === 'purchase' ? (r.ref.startsWith('np:') ? ' · crypto' : r.ref.startsWith('cs_') ? ' · Stripe' : '') : ''}</td><td className={`tabular ${r.delta < 0 ? 'text-muted' : 'text-cyan'}`}>{r.delta > 0 ? '+' : ''}{r.delta}</td><td className="max-w-[16rem] truncate text-xs text-muted">{r.ref}</td></tr>)}</tbody></table></div>
    </section>}
  </div>;
}
