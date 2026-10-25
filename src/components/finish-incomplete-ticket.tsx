'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/format';

export function FinishIncompleteTicket({ ticketId, compact = false }: { ticketId: string; compact?: boolean }) {
  const router=useRouter();const inFlight=useRef(false);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
  async function finish(){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError(null);
    try{const r=await api<{jobId:string}>(`/api/tickets/${ticketId}/complete`,{method:'POST'});router.push(`/?tab=analiza&job=${r.jobId}`);}
    catch(e){setError((e as Error).message);setBusy(false);inFlight.current=false;}
  }
  return <div className={compact?'mt-2 space-y-2':'card space-y-3 border-gold/40 p-4'}>
    {!compact&&<p className="text-sm text-muted">Continuă aceeași analiză, cu ținta și echipa păstrate. Reverificăm selecțiile salvate și căutăm meciuri noi. Meciurile începute și cotele indisponibile nu pot intra în biletul final. Dacă nu sunt suficiente selecții valide, biletul rămâne incomplet.</p>}
    <button type="button" onClick={finish} disabled={busy} className={`btn btn-primary disabled:opacity-50 ${compact?'px-3 py-2 text-xs':'px-5 py-3'}`}><Sparkles size={14} aria-hidden/>{busy?'Pornesc finalizarea…':'Finalizează biletul'}</button>
    {error&&<p role="alert" className="text-sm text-rose">{error}</p>}
  </div>;
}
