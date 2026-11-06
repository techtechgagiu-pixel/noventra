import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { EXTRA_MAX, EXTRA_MIN, extraCents, parseExtra, planById } from '@/lib/credits';
import { makeOrderId } from '@/lib/nowpayments';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Starts a NOWPayments invoice (EUR price, paid in crypto). Credits are added by the IPN webhook only. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`crypto:${user.id}`, 5, 60_000)) return fail('Prea multe cereri. Așteaptă un minut.', 429);
  if (!config.nowpaymentsApiKey) return fail('Plata cu crypto nu este configurată încă.', 503);
  const body = await req.json().catch(() => null) as { plan?: string; extra?: number } | null;
  const extra = body?.extra !== undefined ? parseExtra(body.extra) : null;
  if (body?.extra !== undefined && extra === null) return fail(`Alege între ${EXTRA_MIN} și ${EXTRA_MAX} credite.`, 400);
  const plan = extra === null ? planById(body?.plan) : { id: 'extra', name: 'Credite extra', credits: extra, priceCents: extraCents(extra) };
  if (!plan) return fail('Plan necunoscut.', 400);
  const res = await fetch('https://api.nowpayments.io/v1/invoice', {
    method: 'POST', headers: { 'x-api-key': config.nowpaymentsApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_amount: Number((plan.priceCents / 100).toFixed(2)), price_currency: 'eur',
      order_id: makeOrderId(user.id, plan.id, plan.credits),
      order_description: extra === null ? `PRIMUL 11 · ${plan.name} (${plan.credits} credite)` : `PRIMUL 11 · ${plan.credits} credite extra`,
      ipn_callback_url: `${config.appBaseUrl}/api/billing/crypto/webhook`,
      success_url: `${config.appBaseUrl}/planuri?plata=ok`, cancel_url: `${config.appBaseUrl}/planuri?plata=anulata`,
    }),
  });
  const data = await res.json().catch(() => ({})) as { invoice_url?: string; message?: string };
  if (!res.ok || !data.invoice_url) {
    console.log(JSON.stringify({ event: 'nowpayments_invoice_failed', status: res.status, message: data.message }));
    return fail(`Nu am putut porni plata cu crypto${data.message ? ` (${String(data.message).slice(0, 120)})` : ''}.`, 502);
  }
  return json({ url: data.invoice_url });
}
