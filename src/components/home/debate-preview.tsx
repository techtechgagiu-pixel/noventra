'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AGENT_META, fmtDateTime } from '@/lib/format';
import type { Thread, ThreadMsg } from '@/lib/home-reel';

const STEPS = ['Propunere', 'Contradicție', 'Decizie'];
const EXPLAIN = [
  { title: 'Aceleași date. Perspective diferite.', text: 'Fiecare agent citește dosarul meciului și propune o selecție sau refuză. Are propriul stil și propriile limite de risc.' },
  { title: 'O opinie trebuie să reziste la obiecții.', text: 'Agenții contestă argumentele celorlalți. Pot să-și schimbe poziția sau să o susțină cu dovezi. Știrile intră în discuție.' },
  { title: 'Voturi suficiente. Apoi verdictul.', text: 'Selecțiile care trec pragul de susținere ajung pe lista scurtă. Mircea Lucescu alege dintre ele; echipa poate și să refuze un meci.' },
];
const VERBS: Partial<Record<ThreadMsg['kind'], string>> = { pick: 'propune', nobet: 'refuză', objection: 'contestă', revised: 'își schimbă poziția', kept: 'își menține poziția', brain: 'dă verdictul' };

/** Small, user-controlled preview. No polling, autoplay, map bundle or inference. */
export function DebatePreview({ thread, models = {} }: { thread?: Thread; models?: Record<string, string> }) {
  const [step, setStep] = useState(0);
  const replayable = !!thread && /^[0-9a-f-]{36}\|/.test(thread.key);
  const ids = thread ? [...new Set(thread.messages.flatMap((m) => m.agentId ? [m.agentId] : []))].slice(0, 5) : ['andrei', 'alex', 'hantu', 'robert'];
  const messages = thread?.messages.filter((m) => step === 0 ? ['pick', 'nobet'].includes(m.kind) : step === 1 ? ['objection', 'revised', 'kept'].includes(m.kind) : ['brain', 'result'].includes(m.kind));
  return <section className="debate-preview" aria-label={thread ? 'Fragment real din dezbatere' : 'Cum dezbat agenții AI'}>
    <div className="debate-preview-top"><span>{thread ? 'Dintr-o analiză reală' : 'La masa dezbaterii'}</span><span>{thread ? fmtDateTime(thread.at) : '32 de analiști AI + redacția'}</span></div>
    <div className="debate-cast">
      {ids.map((id) => { const a = AGENT_META[id]; if (!a) return null; return <div key={id} className="debate-cast-agent" style={{ ['--agent-color' as string]: a.accent }}>
        <img src={a.img} alt="" width={64} height={64} />
        <strong>{a.short}</strong><span>{models[id] ? models[id].split('/').at(-1) : 'Agent AI'}</span>
      </div>; })}
    </div>
    <div className="debate-preview-title"><h2>{thread?.match ?? 'Argumentele intră în teren.'}</h2><p>{thread ? 'Personaje AI, argumente reale din jurnal. Cotele sunt cele de la data analizei.' : 'Personaje cu stiluri diferite. Modele AI în spatele lor.'}</p></div>
    <div className="debate-step-buttons" role="group" aria-label="Etapele dezbaterii">
      {STEPS.map((label, i) => <button key={label} type="button" aria-pressed={step === i} aria-controls="debate-preview-content" onClick={() => setStep(i)}><span aria-hidden>{i + 1}</span>{label}</button>)}
    </div>
    <div id="debate-preview-content" className="debate-preview-content" aria-live="polite" aria-atomic="true">
      {thread ? messages?.length ? messages.map((m) => {
        const a = m.agentId ? AGENT_META[m.agentId] : null;
        return <div key={m.seq} className={`debate-excerpt ${m.kind === 'result' ? 'debate-excerpt-result' : ''}`}>
          {a && <img src={a.img} alt="" width={32} height={32} />}
          <div><p className="debate-speaker" style={{ color: a?.accent }}><strong>{a?.name ?? 'Rezultatul dezbaterii'}</strong> {VERBS[m.kind]}</p>{m.chip && <p className="debate-market">{m.chip}</p>}<p>{m.text}</p></div>
        </div>;
      }) : <p className="text-sm text-muted">Etapa nu are un fragment înregistrat pentru acest meci. Jurnalul păstrează contextul complet.</p> : <div className="debate-explanation"><h3>{EXPLAIN[step].title}</h3><p>{EXPLAIN[step].text}</p></div>}
    </div>
    <div className="debate-preview-foot">{replayable && thread ? <Link href={`/?tab=analiza&job=${thread.key.split('|')[0]}`}>Vezi dezbaterea completă</Link> : <span>{thread ? 'De la opinie individuală la consensul echipei.' : 'Tu configurezi biletul. Echipa argumentează selecțiile.'}</span>}<span>{thread ? 'Fără o analiză nouă' : 'Nicio analiză nu pornește aici'}</span></div>
  </section>;
}
