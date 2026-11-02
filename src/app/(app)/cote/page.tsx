import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { canSeeAccounts } from '@/lib/ticket-removal';
import { importStatus } from '@/lib/sports/imported-prices';
import { OddsImport } from '@/components/odds/odds-import';
import { StakeResults } from '@/components/odds/stake-results';
import { pendingStakeResults } from '@/lib/sports/stake-results';

export const dynamic = 'force-dynamic';

/** Owner decision 29.10: odds exported on the laptop (Stake) are imported here and used by the agents for 4 days. */
export default async function Cote() {
  const user = await currentUser();
  if (!canSeeAccounts(user)) notFound();
  const [status, pending] = await Promise.all([importStatus(), pendingStakeResults().catch(() => [])]);
  return <div className="mx-auto max-w-3xl space-y-4">
    <h1 className="page-title">Import cote</h1>
    <p className="page-lead">Încarci aici fișierul exportat pe laptop din <code>stake-sports-api</code>. Oferta de fotbal vine doar din acest export: meciurile se potrivesc cu programul ESPN (istoric și rezultate automate), iar cele pe care ESPN nu le are intră ca meciuri doar-Stake. Agenții folosesc cotele exact cum sunt timp de {Math.round(status.maxAgeHours / 24)} zile de la export.</p>
    <OddsImport initial={status} />
    <StakeResults initial={pending} />
  </div>;
}
