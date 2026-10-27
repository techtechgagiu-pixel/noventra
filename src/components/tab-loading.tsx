const LABELS: Record<string, string> = { acasa: 'Acasă', custom: 'Bilet custom', verifica: 'Biletul tău', analiza: 'Analiză', istoric: 'Bilete create', statistici: 'Statistici', meciuri: 'Meciuri' };

export function TabLoading({ tab }: { tab?: string }) {
  return <div className="space-y-5" role="status" aria-label={`Se încarcă ${LABELS[tab ?? ''] ?? 'pagina'}`}>
    <h1 className="page-title">{LABELS[tab ?? ''] ?? 'PRIMUL 11'}</h1>
    <p className="text-sm text-muted">Se încarcă…</p>
    <div aria-hidden className="grid animate-pulse gap-4 sm:grid-cols-2">
      {[0, 1, 2, 3].map(i => <div key={i} className="h-40 rounded-xl border border-line bg-panel" />)}
    </div>
  </div>;
}
