import type { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { verifySignature } from '@/lib/stripe-signature';
import { addPurchasedCredits, extraCents, parseExtra, planById } from '@/lib/credits';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get('stripe-signature'), config.stripeWebhookSecret))) return new Response('Semnătură invalidă', { status: 400 });
  const event = JSON.parse(raw) as { type: string; data: { object: { id: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: { userId?: string; plan?: string; credits?: string } } } };
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    if (s.payment_status === 'paid' && s.metadata?.userId) {
      if (s.metadata.plan === 'extra') {
        // Extra credits: the count must match what was actually paid at the single-credit price.
        const n = parseExtra(s.metadata.credits);
        if (n !== null && s.currency === 'eur' && s.amount_total === extraCents(n)) await addPurchasedCredits(s.metadata.userId, n, s.id);
      } else {
        // Plans: the credits come from our own plan table, never from client-sent numbers.
        const plan = planById(s.metadata.plan);
        if (plan) await addPurchasedCredits(s.metadata.userId, plan.credits, s.id);
      }
    }
  }
  return new Response('ok');
}
