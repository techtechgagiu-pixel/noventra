import { closePool, query, one } from '@/lib/db';
export * from '@/lib/testing/fakes';

export async function resetDb() {
  await query(`TRUNCATE analysis_events, agent_predictions, final_decisions, scout_dossiers, fixture_snapshots, ticket_selections, tickets, ticket_generation_jobs, odds_snapshots, fixtures, sessions, users, model_usage_logs, provider_usage, audit_logs, historical_match_statistics, agent_model_assignments, agent_prompt_versions RESTART IDENTITY CASCADE`);
}
export async function makeUser(email = 'u@test.local') {
  return (await one<{ id: string }>(`INSERT INTO users(google_sub,email,name) VALUES ($1,$2,'T') RETURNING id`, [`test:${email}`, email]))!.id;
}
export { closePool };
