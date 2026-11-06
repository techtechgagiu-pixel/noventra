import Link from 'next/link';
import { Check } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { FREE_SIGNUP_CREDITS, EXTRA_MAX, EXTRA_MIN, EXTRA_PACKS, PLANS, SINGLE_CREDIT_CENTS, creditsForLegs, getAccount } from '@/lib/credits';
import { config } from '@/lib/config';
import { BuyButton, ExtraCredits } from '@/components/plans-buy';
import { CreditsBadge } from '@/components/credits-badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Planuri · PRIMUL 11', description: 'Credite pentru biletele tale: un credit acoperă un meci.' };

const eur = (cents: number) => `€${(cents / 100).toFixed(2).replace('.', ',')}`;
const INCLUDED = ['Toți agenții, cu orice echipă (maximum 6 pe bilet)', 'Bilete custom cu toate opțiunile: cotă, meciuri, ligi, piețe, interval', 'Selectorul „câți agenți trebuie să fie de acord”', 'Dezbatere completă și verdict în maximum 30 de minute', 'Istoricul biletelor și rezultatele'];

export default async function Planuri({ searchParams }: { searchParams: Promise<{ plata?: string }> }) {
  const { plata } = await searchParams;
  const user = await currentUser();
  const account = user ? await getAccount(user.id) : null;
  return <main className="mx-auto max-w-6xl px-4 py-10">
    <div className="flex items-center justify-between gap-3">
      <Link href={user ? '/?tab=custom' : '/'} className="text-sm text-muted hover:text-text">← Înapoi</Link>
      {user && <CreditsBadge afterPayment={plata === 'ok'} />}
    </div>
    <h1 className="mt-4 font-display text-4xl font-bold leading-tight">Alege-ți pachetul de credite.</h1>
    <p className="mt-3 max-w-2xl text-muted">Un credit acoperă un meci de pe bilet: un bilet de 6 meciuri costă 6 credite, unul de 12 costă 12. Dacă un bilet iese fără nicio selecție, creditele se întorc.</p>
    {plata === 'ok' && <p role="status" className="mt-5 rounded-xl border border-cyan/50 bg-cyan/10 px-4 py-3 text-sm">Plata a fost primită. Creditele apar în câteva secunde.</p>}
    {plata === 'anulata' && <p role="status" className="mt-5 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm text-gold">Plata a fost anulată. Nu s-a retras nimic.</p>}
    {account && <p className="mt-5 text-sm">{account.founder ? <span className="rounded-full border border-gold/60 px-3 py-1 text-gold">Cont fondator: biletele tale rămân gratuite.</span> : <span>Ai <strong className="text-gold">{account.balance}</strong> credite.</span>}</p>}
    <div className="mt-8 grid gap-5 md:grid-cols-3">
      {PLANS.map((p) => {
        const per = p.priceCents / p.credits; const off = Math.round((1 - per / SINGLE_CREDIT_CENTS) * 100);
        return <section key={p.id} className={`card flex flex-col gap-4 p-6 ${p.featured ? 'border-gold/70 ring-1 ring-gold/40' : ''}`} aria-label={`Plan ${p.name}`}>
          <div><h2 className="font-display text-2xl font-bold">{p.name}</h2><p className="text-sm text-muted">{p.slogan}</p>{p.featured && <p className="mt-1 text-xs font-semibold text-gold">Cel mai ales</p>}</div>
          <p className="font-display text-4xl font-bold">{eur(p.priceCents)}</p>
          <p className="text-sm text-muted">{p.credits} credite · {eur(per)} per credit{off > 0 ? ` · −${off}%` : ''}</p>
          <ul className="space-y-1.5 text-sm">
            <li>până la <strong>{Math.floor(p.credits / creditsForLegs(6))}</strong> bilete de 6 meciuri</li>
            <li>sau <strong>{Math.floor(p.credits / creditsForLegs(12))}</strong> de 12 meciuri</li>
            <li>sau <strong>{Math.floor(p.credits / creditsForLegs(20))}</strong> de 20 de meciuri</li>
            <li className="text-muted">Le poți combina oricum.</li>
          </ul>
          <ul className="space-y-1.5 border-t border-line pt-4 text-sm">{INCLUDED.map((x) => <li key={x} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-cyan" aria-hidden />{x}</li>)}</ul>
          <div className="mt-auto"><div className="space-y-2"><BuyButton plan={p.id} signedIn={!!user} featured={p.featured} label={`Alege ${p.name}`} />{config.nowpaymentsApiKey && <BuyButton crypto plan={p.id} signedIn={!!user} label="Plătește cu crypto" />}</div></div>
        </section>;
      })}
    </div>
    <section id="extra" className="card mt-8 p-6" aria-label="Credite extra">
      <h2 className="font-display text-2xl font-bold">Ți s-au terminat creditele? Încarcă doar cât ai nevoie.</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">Creditele extra costă {eur(SINGLE_CREDIT_CENTS)} bucata, fără abonament, și se adaugă la cele pe care le ai deja. Pachetele de mai sus ies mai ieftine pe credit. Un bilet de 10 meciuri costă 10 credite.</p>
      <div className="mt-4"><ExtraCredits signedIn={!!user} packs={EXTRA_PACKS} minCredits={EXTRA_MIN} maxCredits={EXTRA_MAX} centsPerCredit={SINGLE_CREDIT_CENTS} cryptoEnabled={!!config.nowpaymentsApiKey} /></div>
    </section>
    <p className="mt-6 text-sm text-muted">Un credit luat separat costă {eur(SINGLE_CREDIT_CENTS)}. Creditele nu expiră. Primești {FREE_SIGNUP_CREDITS} credite gratuite la crearea contului. Plata se face în euro, prin Stripe.</p>
  </main>;
}
