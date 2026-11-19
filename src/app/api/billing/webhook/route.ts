import type { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { verifySignature } from '@/lib/stripe-signature';
import { addPurchasedCredits, paidSessionCredits } from '@/lib/credits';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get('stripe-signature'), config.stripeWebhookSecret))) return new Response('Semnătură invalidă', { status: 400 });
  const event = JSON.parse(raw) as { type: string; data: { object: { id: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: { userId?: string; plan?: string; credits?: string } } } };
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object;
    if (s.payment_status === 'paid' && s.metadata?.userId) {
      // Plans and extra credits: added only when the paid sum and currency match our own price (an altered session buys nothing).
      const credits = paidSessionCredits(s);
      if (credits !== null) await addPurchasedCredits(s.metadata.userId, credits, s.id);
    }
  }
  return new Response('ok');
}
