import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { canSeeAccounts } from '@/lib/ticket-removal';
import { importStatus } from '@/lib/sports/imported-prices';
import { OddsImport } from '@/components/odds/odds-import';
import { AutoImport } from '@/components/odds/auto-import';
import { importTokenStatus } from '@/lib/import-token';

export const dynamic = 'force-dynamic';

/** Owner decision 29.10: odds exported on the laptop (Stake) are imported here and used by the agents for 24 hours (02.11, automatic import from the laptop). */
export default async function Cote() {
  const user = await currentUser();
  if (!canSeeAccounts(user)) notFound();
  const [status, auto] = await Promise.all([importStatus(), importTokenStatus(user!.id).catch(() => ({ active: false, createdAt: null, lastUsedAt: null }))]);
  return <div className="mx-auto max-w-3xl space-y-4">
    <h1 className="page-title">Import cote</h1>
    <p className="page-lead">Încarci aici fișierul exportat pe laptop din <code>stake-sports-api</code>. Oferta de fotbal vine doar din acest export: meciurile se potrivesc cu programul ESPN (istoric și rezultate automate), iar cele pe care ESPN nu le are intră ca meciuri doar-Stake. Agenții folosesc cotele exact cum sunt timp de {status.maxAgeHours} de ore de la export.</p>
    <AutoImport initial={auto} />
    <OddsImport initial={status} />
  </div>;
}
