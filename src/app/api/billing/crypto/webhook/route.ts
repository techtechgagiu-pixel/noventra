import type { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { verifyIpn, parseOrderId } from '@/lib/nowpayments';
import { addPurchasedCredits, extraCents, parseExtra, planById } from '@/lib/credits';

export const dynamic = 'force-dynamic';

type Ipn = { payment_status?: string; order_id?: string; price_amount?: number | string; price_currency?: string };

/** NOWPayments IPN. Credits are added once, only for a fully `finished` payment whose EUR price matches our own price for that plan. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await verifyIpn(raw, req.headers.get('x-nowpayments-sig'), config.nowpaymentsIpnSecret))) return new Response('Semnătură invalidă', { status: 400 });
  const ipn = JSON.parse(raw) as Ipn;
  const order = parseOrderId(ipn.order_id);
  if (ipn.payment_status === 'finished' && order && String(ipn.price_currency).toLowerCase() === 'eur') {
    const paid = Math.round(Number(ipn.price_amount) * 100);
    const ref = `np:${ipn.order_id}`;
    if (order.plan === 'extra') {
      const n = parseExtra(order.credits);
      if (n !== null && paid === extraCents(n)) await addPurchasedCredits(order.userId, n, ref);
    } else {
      const plan = planById(order.plan);
      if (plan && plan.credits === order.credits && paid === plan.priceCents) await addPurchasedCredits(order.userId, plan.credits, ref);
    }
  }
  return new Response('ok');
}
