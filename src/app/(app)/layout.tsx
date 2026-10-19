import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Nav } from '@/components/nav';

export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <>
      <Nav admin={user.role === 'admin'} name={user.email} />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-muted">18+ · Analizele nu garantează rezultatele și nu plasează pariuri. Joacă responsabil.</footer>
    </>
  );
}
