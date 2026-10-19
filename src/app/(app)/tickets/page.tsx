import { currentUser } from '@/lib/auth';
import { listTickets } from '@/lib/views';
import { TicketArchive } from '@/components/ticket-archive';

export const dynamic = 'force-dynamic';
export default async function Tickets() {
  const user = (await currentUser())!;
  const tickets = await listTickets(user.id);
  return <TicketArchive tickets={JSON.parse(JSON.stringify(tickets))} />;
}
