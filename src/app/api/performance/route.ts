import { NextResponse, type NextRequest } from 'next/server';
import { json, requireUser } from '@/lib/http';
import { many, one } from '@/lib/db';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const tickets = await one<Record<string, number>>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE generation_status='COMPLETED')::int AS completed, count(*) FILTER (WHERE generation_status='INCOMPLETE')::int AS incomplete,
            count(*) FILTER (WHERE generation_status='NO_BET')::int AS no_bet, count(*) FILTER (WHERE outcome_status='WON')::int AS won, count(*) FILTER (WHERE outcome_status='LOST')::int AS lost,
            count(*) FILTER (WHERE outcome_status='PENDING')::int AS pending, count(*) FILTER (WHERE outcome_status IN ('VOID','PARTIAL_VOID'))::int AS void,
            COALESCE(sum(CASE WHEN outcome_status='WON' THEN actual_odds - 1 WHEN outcome_status='LOST' THEN -1 ELSE 0 END),0)::float AS units
     FROM tickets WHERE user_id=$1`, [user.id]);
  const selections = await many<Record<string, unknown>>(
    `SELECT split_part(s.market_key,':',1) AS market, count(*)::int AS n, count(*) FILTER (WHERE s.outcome='WON')::int AS won, count(*) FILTER (WHERE s.outcome='LOST')::int AS lost,
            avg(s.model_probability) FILTER (WHERE s.outcome IN ('WON','LOST'))::float AS avg_prob
     FROM ticket_selections s JOIN tickets t ON t.id=s.ticket_id WHERE t.user_id=$1 GROUP BY 1 ORDER BY 2 DESC`, [user.id]);
  return json({ tickets, selections });
}
