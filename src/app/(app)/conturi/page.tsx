import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { canSeeAccounts } from '@/lib/ticket-removal';
import { accountsList } from '@/lib/accounts';
import { AccountManager, type Account } from '@/components/account-manager';

export const dynamic = 'force-dynamic';

/** Owner request 28.10: the owner's Google account sees every account that signed in with Google (read-only). */
export default async function Conturi() {
  const user = await currentUser();
  if (!canSeeAccounts(user)) notFound();
  const accounts = JSON.parse(JSON.stringify(await accountsList())) as Account[];
  const active = accounts.filter((a) => !a.blocked_at).length;
  return <div className="mx-auto max-w-3xl space-y-4">
    <h1 className="page-title">Conturi Google</h1>
    <p className="page-lead">{accounts.length} {accounts.length === 1 ? 'cont s-a conectat' : 'conturi s-au conectat'} cu Google{accounts.length !== active ? `, ${accounts.length - active} blocate` : ''}. Ultima intrare apare prima.</p>
    <AccountManager initial={accounts} readOnly={user!.role !== 'admin'} />
  </div>;
}
