import { describeModel } from '@/lib/model-identities';
import { NextResponse, type NextRequest } from 'next/server';
import { json, requireUser } from '@/lib/http';
import { AGENTS } from '@/lib/ai/agents';
import { activeAssignments } from '@/lib/ai/assignments';
import { allTrackRecords } from '@/lib/track-record';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  const a = await activeAssignments();
  const month = req.nextUrl.searchParams.get('month');
  const options = { userId: req.nextUrl.searchParams.get('scope') === 'mine' ? user.id : undefined, month: month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : 'all' };
  const records = new Map((await allTrackRecords(AGENTS.map((x) => x.id), options).catch(() => [])).map((r) => [r.id, r.record]));
  return json({ agents: AGENTS.map((x) => ({ id: x.id, name: describeModel(a.get(x.id)?.primary?.model).modelName, title: x.title, specialty: x.specialty, risk: x.risk, maxOdds: x.maxOdds, minProbability: x.minProbability, trackRecord: records.get(x.id) ?? null, accent: x.accent, voting: x.id !== 'scout' && x.id !== 'corina', model: a.get(x.id)?.primary ?? null, fallback: a.get(x.id)?.fallback ?? null, promptVersion: a.get(x.id)?.promptVersion })) });
}
