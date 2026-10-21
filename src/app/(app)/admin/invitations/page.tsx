import { requireAdminPage } from '@/lib/admin-guard';
import { many } from '@/lib/db';
import { InvitationManager, type Invitation } from '@/components/invitation-manager';
export const dynamic = 'force-dynamic';
export default async function Invitations() {
  await requireAdminPage();
  const rows = await many('SELECT id,label,created_at,expires_at,revoked_at,last_used_at,use_count FROM invitation_codes ORDER BY created_at DESC LIMIT 200');
  return <div className="mx-auto max-w-3xl space-y-6"><h1 className="font-display text-3xl font-bold">Coduri de invitație</h1><p className="text-sm text-muted">Fiecare cod oferă acces 7 zile de la emitere, fără cont. Vizitatorii își păstrează biletele în spații separate și nu au acces la administrare. Codul tău de administrator nu expiră.</p><InvitationManager initial={JSON.parse(JSON.stringify(rows)) as Invitation[]} /></div>;
}
