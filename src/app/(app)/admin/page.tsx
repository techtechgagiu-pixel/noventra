import { requireAdminPage } from '@/lib/admin-guard';
import { AdminPanel } from '@/components/admin-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · PRIMUL 11' };
export default async function AdminHome() {
  await requireAdminPage();
  return <div className="space-y-5"><h1 className="font-display text-3xl font-bold">Panou admin</h1><AdminPanel /></div>;
}
