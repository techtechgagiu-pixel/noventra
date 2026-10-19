import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ticketDetail } from '@/lib/views';
import { TicketView, type TicketData } from '@/components/ticket-view';

export const dynamic = 'force-dynamic';
export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fresh?: string }> }) {
  const user = (await currentUser())!;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await ticketDetail(user.id, id);
  if (!t) notFound();
  return <TicketView t={JSON.parse(JSON.stringify(t)) as TicketData} fresh={(await searchParams).fresh === '1'} />;
}
