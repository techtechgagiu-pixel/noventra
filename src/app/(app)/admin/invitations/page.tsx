import { requireAdminPage } from '@/lib/admin-guard';
import { many } from '@/lib/db';
import { InvitationManager, type Invitation } from '@/components/invitation-manager';
import { AccountManager, type Account } from '@/components/account-manager';
import { accountsList } from '@/lib/accounts';
export const dynamic = 'force-dynamic';
export default async function Invitations() {
  await requireAdminPage();
  const [rows, accounts] = await Promise.all([
    many('SELECT id,label,created_at,expires_at,revoked_at,last_used_at,use_count FROM invitation_codes ORDER BY created_at DESC LIMIT 200'),
    accountsList(),
  ]);
  return <div className="mx-auto max-w-3xl space-y-6">
    <h1 className="font-display text-3xl font-bold">Conturi și acces</h1>
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold">Conturi Google</h2>
      <p className="text-sm text-muted">Oricine are cont Google poate intra și crea bilete; biletele apar la toată lumea, cu numele celui care le-a creat. Administrarea rămâne doar cu codul tău. Un cont blocat este scos imediat.</p>
      <AccountManager initial={JSON.parse(JSON.stringify(accounts)) as Account[]} />
    </section>
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold">Coduri de invitație</h2>
      <p className="text-sm text-muted">Opțional, pentru cine nu vrea să intre cu Google: fiecare cod oferă acces 7 zile. Codul tău de administrator nu expiră.</p>
      <InvitationManager initial={JSON.parse(JSON.stringify(rows)) as Invitation[]} />
    </section>
  </div>;
}
