import { atomic, one, query } from './db';
import { config } from './config';
import { SlotError } from './jobs/errors';

/** 1 credit = up to 6 matches on a ticket (owner plan 06.11). A 7–12 match ticket costs 2, 13–18 costs 3, 20 costs 4. */
export const CREDIT_SIZE = 6;
export const FREE_SIGNUP_CREDITS = 2;
export const creditsForLegs = (legs: number) => Math.max(1, Math.ceil(legs / CREDIT_SIZE));

export type Plan = { id: 'debut' | 'titular' | 'capitan'; name: string; slogan: string; credits: number; priceCents: number; perDay: number; maxLegs: number; featured?: boolean };
/** Prices in euro cents; one credit alone is €0.60. */
export const PLANS: Plan[] = [
  { id: 'debut', name: 'Debut', slogan: 'Încearcă echipa', credits: 10, priceCents: 549, perDay: 3, maxLegs: 12 },
  { id: 'titular', name: 'Titular', slogan: 'Joci în fiecare etapă', credits: 40, priceCents: 1790, perDay: 6, maxLegs: 20, featured: true },
  { id: 'capitan', name: 'Căpitan', slogan: 'Banca ta de analiști AI', credits: 120, priceCents: 4390, perDay: 12, maxLegs: 20 },
];
export const SINGLE_CREDIT_CENTS = 60;
export const planById = (id: unknown) => PLANS.find((p) => p.id === id);

export type Account = { balance: number; founder: boolean };

/** Existing accounts were marked founders by the migration; any later account starts with the free credits. */
export async function getAccount(userId: string): Promise<Account> {
  let row = await one<{ balance: number; founder: number }>('SELECT balance, founder FROM user_credits WHERE user_id=$1', [userId]);
  if (!row) {
    const ins = await query('INSERT INTO user_credits (user_id, balance, founder) VALUES ($1,$2,0) ON CONFLICT DO NOTHING', [userId, FREE_SIGNUP_CREDITS]);
    if (ins.rowCount) await query("INSERT INTO credit_ledger (user_id, delta, reason, ref) VALUES ($1,$2,'signup',$1) ON CONFLICT DO NOTHING", [userId, FREE_SIGNUP_CREDITS]);
    row = await one<{ balance: number; founder: number }>('SELECT balance, founder FROM user_credits WHERE user_id=$1', [userId]);
  }
  return { balance: Number(row?.balance ?? 0), founder: Number(row?.founder ?? 0) === 1 };
}

const duplicate = (e: Error) => /UNIQUE|duplicate key/i.test(e.message);

/** Charges a whole batch once (ref = the batch's request id): a retry of the same request never charges twice. */
export async function chargeCredits(userId: string, cost: number, ref: string) {
  if (!config.creditsEnabled) return;
  const acc = await getAccount(userId);
  if (acc.founder) return;
  try {
    await atomic([
      { text: 'UPDATE user_credits SET balance=balance-$2 WHERE user_id=$1', params: [userId, cost] },
      { text: "INSERT INTO credit_ledger (user_id, delta, reason, ref) VALUES ($1,$2,'charge',$3)", params: [userId, -cost, ref] },
    ]);
  } catch (e) {
    if (duplicate(e as Error)) return; // already charged for this request
    if (/CHECK|check constraint|balance/i.test((e as Error).message)) throw new SlotError(`Nu ai destule credite: biletul costă ${cost}, ai ${acc.balance}. Alege un plan din „Planuri”.`, 402);
    throw e;
  }
}

async function credit(userId: string, amount: number, reason: string, ref: string) {
  try {
    await atomic([
      { text: 'UPDATE user_credits SET balance=balance+$2 WHERE user_id=$1', params: [userId, amount] },
      { text: 'INSERT INTO credit_ledger (user_id, delta, reason, ref) VALUES ($1,$2,$4,$3)', params: [userId, amount, ref, reason] },
    ]);
    return true;
  } catch (e) {
    if (duplicate(e as Error)) return false; // already applied
    throw e;
  }
}

/** Adds the credits bought with a Stripe Checkout session once (ref = session id). */
export async function addPurchasedCredits(userId: string, credits: number, sessionId: string) {
  await getAccount(userId);
  return credit(userId, credits, 'purchase', sessionId);
}

/** Gives the credits back for a request that could not be created. */
export async function refundBatch(userId: string, cost: number, requestId: string) {
  if (!config.creditsEnabled) return;
  const charged = await one('SELECT 1 AS x FROM credit_ledger WHERE ref=$1 AND reason=$2', [requestId, 'charge']);
  // A retry that fails after the tickets were already created must not give the credits back.
  const created = await one("SELECT 1 AS x FROM ticket_generation_jobs WHERE user_id=$1 AND config->'customBatch'->>'id'=$2 LIMIT 1", [userId, requestId]);
  if (charged && !created) await credit(userId, cost, 'refund', requestId);
}

/** A ticket that ended without a ticket (no selection, failed) gives its credits back, once per job. */
export async function refundJob(job: { id: string; user_id: string; config: { custom?: { legs: number }; customBatch?: { id: string } } }) {
  if (!config.creditsEnabled || !job.config.custom || !job.config.customBatch) return;
  const charged = await one('SELECT 1 AS x FROM credit_ledger WHERE ref=$1 AND reason=$2', [job.config.customBatch.id, 'charge']);
  if (charged) await credit(job.user_id, creditsForLegs(job.config.custom.legs), 'refund', job.id);
}
