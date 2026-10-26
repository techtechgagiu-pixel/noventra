import { requireAdminPage } from '@/lib/admin-guard';
import { many } from '@/lib/db';
import { AdminTabs } from '@/components/admin-tabs';
import { fmtDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
/** Ideas and problems sent through „Ajută-ne să îmbunătățim”. */
export default async function Feedback() {
  await requireAdminPage();
  const rows = await many<{ id: string; author: string | null; kind: string; message: string; page: string | null; created_at: string }>('SELECT id, author, kind, message, page, created_at FROM feedback ORDER BY created_at DESC LIMIT 200');
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold">Sugestii</h1><AdminTabs active="/admin/feedback" />
      {rows.length === 0 ? <p className="text-sm text-muted">Nicio sugestie încă.</p> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.id} className="card p-4">
            <p className="text-xs text-muted">{fmtDateTime(r.created_at)} · {r.author ?? 'anonim'} · <span className="text-gold">{r.kind}</span>{r.page ? ` · ${r.page}` : ''}</p>
            <p className="mt-1 whitespace-pre-line text-sm">{r.message}</p>
          </li>))}</ul>)}
    </div>
  );
}
