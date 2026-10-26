import Link from 'next/link';
export function AdminTabs({ active }: { active: string }) {
  const tabs = [['/admin/models', 'AI MODELS'], ['/admin/usage', 'Consum & cote'], ['/admin/evaluation', 'MODEL ARENA'], ['/admin/feedback', 'Sugestii']];
  return <div className="flex gap-2">{tabs.map(([h, l]) => <Link key={h} href={h} className={`chip ${active === h ? 'text-cyan border-cyan' : 'text-muted'}`}>{l}</Link>)}</div>;
}
