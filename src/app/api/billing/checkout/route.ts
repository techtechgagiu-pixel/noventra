import { NextResponse, type NextRequest } from 'next/server';
import { fail, json, rateLimited, requireUser, sameOrigin } from '@/lib/http';
import { planById } from '@/lib/credits';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

/** Starts a Stripe Checkout payment (one-time, EUR) for a credit pack. Credits are added by the webhook, not here. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return fail('Cerere respinsă (origine necunoscută).', 403);
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  if (rateLimited(`checkout:${user.id}`, 5, 60_000)) return fail('Prea multe cereri. Așteaptă un minut.', 429);
  if (!config.stripeSecretKey) return fail('Plata nu este configurată încă.', 503);
  const body = await req.json().catch(() => null) as { plan?: string } | null;
  const plan = planById(body?.plan);
  if (!plan) return fail('Plan necunoscut.', 400);
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(plan.priceCents),
    'line_items[0][price_data][product_data][name]': `PRIMUL 11 · ${plan.name} (${plan.credits} credite)`,
    'line_items[0][price_data][product_data][description]': `${plan.credits} credite. Un credit acoperă un bilet de până la 6 meciuri.`,
    success_url: `${config.appBaseUrl}/planuri?plata=ok`,
    cancel_url: `${config.appBaseUrl}/planuri?plata=anulata`,
    client_reference_id: user.id,
    customer_email: user.email,
    'metadata[userId]': user.id,
    'metadata[plan]': plan.id,
    'metadata[credits]': String(plan.credits),
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${config.stripeSecretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const data = await res.json().catch(() => ({})) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) {
    // Stripe's own error text is safe to show (it never contains the key); it tells the owner what to fix.
    console.log(JSON.stringify({ event: 'stripe_checkout_failed', status: res.status, type: (data as { error?: { type?: string } }).error?.type, message: data.error?.message }));
    const hint = res.status === 401 ? ' (cheia Stripe este invalidă; verifică STRIPE_SECRET_KEY)' : data.error?.message ? ` (${data.error.message.slice(0, 160)})` : '';
    return fail(`Nu am putut porni plata${hint}.`, 502);
  }
  return json({ url: data.url });
}
