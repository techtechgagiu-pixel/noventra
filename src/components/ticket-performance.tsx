import { ticketPerformance, type PerformanceTicket } from '@/lib/ticket-performance';
export function TicketPerformance({ tickets }: { tickets: PerformanceTicket[] }) {
  const { tickets: t, selections } = ticketPerformance(tickets);
  const decided = t.won + t.lost + t.partial_void;
  const stat = (label: string, value: string | number) => <div className="card p-4"><p className="text-xs text-muted">{label}</p><p className="font-display text-3xl font-bold tabular">{value}</p></div>;
  return <section aria-label="Performanța biletelor afișate" className="space-y-4">
    <div><h2 className="font-display text-2xl font-bold">Performanța biletelor afișate</h2><p className="text-sm text-muted">Aceleași bilete și filtre ca în lista de mai sus. Rezultatele verzi/roșii ale agenților sunt propriile lor pronosticuri, nu rezultatul întregului bilet.</p></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stat('Bilete afișate',t.total)}{stat('Complete / incomplete / NO BET',`${t.completed} / ${t.incomplete} / ${t.no_bet}`)}
      {stat('Câștigate / pierdute',`${t.won + t.partial_void} / ${t.lost}`)}{stat('În așteptare / anulate',`${t.pending} / ${t.void}`)}{stat('Unități ipotetice (miză 1)',decided ? (t.units >= 0 ? '+' : '') + t.units.toFixed(2) : '—')}
    </div>
    {selections.length > 0 && <div className="card overflow-x-auto p-4"><h3 className="font-display font-bold">Selecțiile din biletele afișate</h3><p className="mb-3 text-xs text-muted">Același meci inclus în două bilete se numără în ambele. Brier se calculează doar pentru selecții decise cu probabilitate salvată.</p><table className="w-full text-left text-sm"><thead className="text-muted"><tr><th>Piață</th><th>Selecții</th><th>Verzi</th><th>Roșii</th><th>În așteptare</th><th>Anulate</th><th>Brier</th></tr></thead><tbody>{selections.map((r) => <tr key={r.market} className="border-t border-line"><td className="py-1.5">{r.market}</td><td>{r.n}</td><td>{r.won}</td><td>{r.lost}</td><td>{r.pending}</td><td>{r.voided}</td><td>{r.brier?.toFixed(3) ?? '—'}</td></tr>)}</tbody></table></div>}
    {decided < 30 && <p className="text-xs text-muted">Eșantion mic: {decided} bilete decise în lista afișată. Nu permite concluzii despre rezultatele pe termen lung.</p>}
  </section>;
}
