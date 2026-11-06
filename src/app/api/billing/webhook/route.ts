import type { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { verifySignature } from '@/lib/stripe-signature';
import { addPurchasedCredits, planById } from '@/lib/credits';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get('stripe-signature'), config.stripeWebhookSecret))) return new Response('Semnătură invalidă', { status: 400 });
  const event = JSON.parse(raw) as { type: string; data: { object: { id: string; payment_status?: string; metadata?: { userId?: string; plan?: string } } } };
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    const plan = planById(s.metadata?.plan);
    // Fulfil only paid sessions; the credits come from our own plan table, never from client-sent numbers.
    if (s.payment_status === 'paid' && s.metadata?.userId && plan) await addPurchasedCredits(s.metadata.userId, plan.credits, s.id);
  }
  return new Response('ok');
}
