import { currentUser } from '@/lib/auth';
import { slotStates } from '@/lib/jobs/service';
import { SlotCards } from '@/components/slot-cards';

export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  const user = (await currentUser())!;
  const slots = await slotStates(user.id);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Salut{user.name ? `, ${user.name.split(' ')[0]}` : ''}!</h1>
        <p className="mt-1 max-w-2xl text-muted">Alege un bilet și apasă <strong className="text-text">CREEAZĂ BILETUL</strong>. Cei șase agenți pornesc doar atunci, analizează meciuri reale și îți arată pas cu pas cum au decis. Dacă nimic nu e suficient de bun, primești sincer „NO BET”.</p>
      </div>
      <SlotCards initial={JSON.parse(JSON.stringify(slots))} />
    </div>
  );
}
