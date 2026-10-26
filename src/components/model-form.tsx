'use client';
import { useState } from 'react';
import { api } from '@/lib/format';
export function ModelForm({ agents }: { agents: Array<{ id: string; name: string; title?: string }> }) {
  const [f, setF] = useState({ agentId: agents[0].id, provider: 'groq', model: '', fallbackProvider: 'groq', fallbackModel: '', reason: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await api('/api/admin/models', { method: 'POST', body: JSON.stringify({ ...f, fallbackModel: f.fallbackModel || null, fallbackProvider: f.fallbackModel ? f.fallbackProvider : null }) }); setMsg('Salvat ca versiune nouă. Predicțiile vechi își păstrează modelul original.'); } catch (er) { setMsg((er as Error).message); } };
  const input = 'rounded-lg border border-line bg-ink px-3 py-2 text-sm';
  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 md:grid-cols-3">
      <h2 className="font-display font-bold md:col-span-3">Schimbă modelul unui agent</h2>
      <select className={input} value={f.agentId} onChange={(e) => setF({ ...f, agentId: e.target.value })} aria-label="Agent">{agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.title ? ` · ${a.title}` : ''}</option>)}</select>
      <select className={input} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} aria-label="Furnizor"><option>groq</option><option>gemini</option><option>openrouter</option></select>
      <input className={input} placeholder="ID model verificat în catalog" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} required />
      <select className={input} value={f.fallbackProvider} onChange={(e) => setF({ ...f, fallbackProvider: e.target.value })} aria-label="Furnizor rezervă"><option>groq</option><option>gemini</option><option>openrouter</option></select>
      <input className={input} placeholder="Model rezervă (gratuit, opțional)" value={f.fallbackModel} onChange={(e) => setF({ ...f, fallbackModel: e.target.value })} />
      <input className={input} placeholder="Motivul schimbării" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required />
      <button className="btn btn-primary px-4 py-2 md:col-span-3">Salvează versiunea</button>
      {msg && <p className="text-sm text-muted md:col-span-3">{msg}</p>}
    </form>
  );
}
