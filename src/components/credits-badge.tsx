'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Coins } from 'lucide-react';

type Account = { balance: number; founder: boolean; plan?: string | null };

/** Credit balance at the top of the page. After a Stripe payment (`afterPayment`) it re-reads the balance until the webhook has added the credits. */
export function CreditsBadge({ afterPayment = false }: { afterPayment?: boolean }) {
  const [acc, setAcc] = useState<Account | null>(null);
  const [added, setAdded] = useState(0);
  const first = useRef<number | null>(null);
  useEffect(() => {
    let stop = false; let tries = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const res = await fetch('/api/credits', { cache: 'no-store' }).catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) as Account | null : null;
      if (stop) return;
      if (data && Number.isFinite(data.balance)) {
        if (first.current === null) first.current = data.balance;
        setAcc({ balance: data.balance, founder: !!data.founder, plan: data.plan ?? null });
        if (data.balance > first.current) { setAdded(data.balance - first.current); return; }
      }
      // The webhook usually lands within a few seconds of the redirect back from Stripe.
      if (afterPayment && ++tries < 12) timer = setTimeout(read, 2500);
    };
    void read();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [afterPayment]);
  if (!acc) return null;
  return <Link href="/planuri" title={acc.founder ? 'Cont fondator: biletele tale rămân gratuite. Creditele cumpărate se păstrează.' : 'Creditele tale. Un credit acoperă un bilet de până la 6 meciuri.'}
    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gold/50 px-2.5 py-1 text-xs font-semibold text-gold hover:bg-gold/10" aria-live="polite">
    <Coins size={13} aria-hidden />{acc.plan && <span className="hidden sm:inline">{acc.plan} ·</span>}<span>{acc.balance} {acc.balance === 1 ? 'credit' : 'credite'}</span>{added > 0 && <span className="text-emerald">+{added}</span>}
  </Link>;
}
