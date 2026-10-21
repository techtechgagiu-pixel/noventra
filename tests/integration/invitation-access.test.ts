import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { createSession, hashAccessCode, issueInvitation, loginWithCode, newAccessCode, userFromToken } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { GET as adminModels } from '@/app/api/admin/models/route';
import { GET as invitations, POST as issue } from '@/app/api/admin/invitations/route';
import { POST as revoke } from '@/app/api/admin/invitations/[id]/revoke/route';
import { POST as login } from '@/app/auth/invite/route';
import { GET as tickets } from '@/app/api/tickets/route';
import { closePool, makeUser, resetDb } from './helpers';

const adminCode = 'P11-ADMIN-01234567-89ABCDEF-01234567-89ABCDEF';
const original = { demo: config.allowDemoProviders, hash: config.ownerAccessCodeHash, admins: config.adminEmails };
const request = (path: string, token?: string, body?: object) => new NextRequest(`http://localhost:3100${path}`, {
  method: body ? 'POST' : 'GET', headers: { ...(token ? { cookie: `bm_sid=${token}` } : {}), origin: 'http://localhost:3100', 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
beforeEach(async () => {
  await resetDb();
  config.allowDemoProviders = false;
  config.ownerAccessCodeHash = hashAccessCode(adminCode);
  config.adminEmails = ['owner@test.local'];
});
afterAll(async () => { config.allowDemoProviders = original.demo; config.ownerAccessCodeHash = original.hash; config.adminEmails = original.admins; await closePool(); });

describe('production invitation access', () => {
  it('rejects anonymous admin reads, ticket reads and invalid sessions', async () => {
    expect((await adminModels(request('/api/admin/models'))).status).toBe(401);
    expect((await tickets(request('/api/tickets'))).status).toBe(401);
    expect(await userFromToken('guessed-session')).toBeNull();
  });
  it('permanent admin code reuses the existing owner identity without deleting its sessions or users', async () => {
    const ownerId = await makeUser('owner@test.local');
    const session = await loginWithCode(adminCode);
    expect(session).not.toBeNull();
    expect(await userFromToken(session!.token)).toMatchObject({ id: ownerId, role: 'admin' });
    const second = await loginWithCode(adminCode.toLowerCase().replace(/-/g, ' '));
    expect(await userFromToken(second!.token)).toMatchObject({ id: ownerId, role: 'admin' });
    expect((await one<{ n: string }>('SELECT count(*) n FROM users'))!.n).toBe('1');
    expect((await one<{ n: string }>('SELECT count(*) n FROM sessions'))!.n).toBe('2');
  });
  it('issues distinct visitor codes expiring exactly seven days after creation and hides their hashes', async () => {
    const owner = await loginWithCode(adminCode);
    const res = await issue(request('/api/admin/invitations', owner!.token, { count: 5, label: 'Invitat' }));
    expect(res.status).toBe(201);
    const fresh = (await res.json()).invitations;
    expect(new Set(fresh.map((x: { code: string }) => x.code)).size).toBe(5);
    const days = await one<{ seconds: string }>('SELECT extract(epoch FROM expires_at-created_at) seconds FROM invitation_codes LIMIT 1');
    expect(Number(days!.seconds)).toBe(7 * 86400);
    const list = await (await invitations(request('/api/admin/invitations', owner!.token))).json();
    expect(list.invitations).toHaveLength(5);
    expect(JSON.stringify(list)).not.toContain(fresh[0].code);
    expect(JSON.stringify(list)).not.toContain('code_hash');
    const session = await loginWithCode(fresh[0].code);
    const visitor = await userFromToken(session!.token);
    expect(visitor?.role).toBe('user');
    expect(visitor?.id).not.toBe((await userFromToken(owner!.token))?.id);
    expect(session!.maxAge).toBeLessThanOrEqual(7 * 86400);
    expect((await adminModels(request('/api/admin/models', session!.token))).status).toBe(403);
    expect((await issue(request('/api/admin/invitations', session!.token, { count: 1 }))).status).toBe(403);
    expect((await tickets(request('/api/tickets', session!.token))).status).toBe(200);
  });
  it('expired codes reject new logins AND existing sessions; logging in again never extends validity', async () => {
    const admin = await loginWithCode(adminCode);
    const owner = (await userFromToken(admin!.token))!;
    const invite = await issueInvitation(owner.id, 'Expiry test');
    await query("UPDATE invitation_codes SET expires_at=now()+interval '2 days' WHERE id=$1", [invite.id]);
    const session = await loginWithCode(invite.code);
    expect(session!.maxAge).toBeLessThanOrEqual(2 * 86400);
    await query("UPDATE invitation_codes SET expires_at=now()-interval '1 second' WHERE id=$1", [invite.id]);
    expect(await loginWithCode(invite.code)).toBeNull();
    expect(await userFromToken(session!.token)).toBeNull();
    expect(await loginWithCode(adminCode)).not.toBeNull();
  });
  it('revocation invalidates visitor sessions and only administrators may revoke', async () => {
    const admin = await loginWithCode(adminCode);
    const owner = (await userFromToken(admin!.token))!;
    const invite = await issueInvitation(owner.id, 'Revoke test');
    const session = await loginWithCode(invite.code);
    const ctx = { params: Promise.resolve({ id: invite.id }) };
    expect((await revoke(request(`/api/admin/invitations/${invite.id}/revoke`, session!.token, {}), ctx)).status).toBe(403);
    expect((await revoke(request(`/api/admin/invitations/${invite.id}/revoke`, admin!.token, {}), ctx)).status).toBe(200);
    expect(await userFromToken(session!.token)).toBeNull();
    expect(await loginWithCode(invite.code)).toBeNull();
    expect(await userFromToken(admin!.token)).not.toBeNull();
  });
  it('invalidates old admin sessions after code rotation and never accepts legacy test sessions in production', async () => {
    const owner = await loginWithCode(adminCode);
    config.ownerAccessCodeHash = hashAccessCode(newAccessCode());
    expect(await userFromToken(owner!.token)).toBeNull();
    expect(await loginWithCode(adminCode)).toBeNull();
    const user = await makeUser('legacy@test.local');
    await expect(createSession(user)).rejects.toThrow('Codul de acces');
    config.allowDemoProviders = true;
    const legacy = await createSession(user);
    config.allowDemoProviders = false;
    expect(await userFromToken(legacy.token)).toBeNull();
  });
  it('rejects foreign origins and invalid codes without issuing cookies', async () => {
    const foreign = new NextRequest('http://localhost:3100/auth/invite', { method: 'POST', headers: { origin: 'https://foreign.example' }, body: new URLSearchParams({ code: adminCode }) });
    expect((await login(foreign)).status).toBe(403);
    const invalid = new NextRequest('http://localhost:3100/auth/invite', { method: 'POST', headers: { origin: 'http://localhost:3100' }, body: new URLSearchParams({ code: 'P11-00000000-00000000-00000000-00000000' }) });
    const res = await login(invalid);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('error=invalid');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('Google accounts and shared tickets', () => {
  it('a Google session is never admin, and a blocked account is signed out at once', async () => {
    const id = await makeUser('fan@gmail.com');
    const s = await createSession(id, 'ua', { google: true });
    expect(await userFromToken(s.token)).toMatchObject({ id, role: 'user' });
    await query("UPDATE users SET role='admin' WHERE id=$1", [id]);
    expect(await userFromToken(s.token)).toMatchObject({ role: 'user' });
    await query('UPDATE users SET blocked_at=now() WHERE id=$1', [id]);
    expect(await userFromToken(s.token)).toBeNull();
  });
  it('every account sees every ticket with its creator; the e-mail is masked for others', async () => {
    const { listTickets, ticketDetail } = await import('@/lib/views');
    const a = await makeUser('ana.pop@gmail.com'), b = await makeUser('bogdan@gmail.com');
    await query("UPDATE users SET name='Ana Pop' WHERE id=$1", [a]);
    const job = await one<{ id: string }>(`INSERT INTO ticket_generation_jobs (user_id, slot, period_key, target_odds, seed, status, stage, config, checkpoint)
      VALUES ($1,'CUSTOM_1',current_date,2,'s','COMPLETED','DONE','{}','{}') RETURNING id`, [a]);
    const t = await one<{ id: string }>(`INSERT INTO tickets (job_id, user_id, slot, period_key, target_odds, generation_status, summary) VALUES ($1,$2,'CUSTOM_1',current_date,2,'NO_BET','{}') RETURNING id`, [job!.id, a]);
    const seen = (await listTickets(b)) as unknown as Array<{ id: string; creator: { name: string; detail: string | null; mine: boolean } }>;
    expect(seen.find((x) => x.id === t!.id)?.creator).toMatchObject({ name: 'Ana Pop', detail: 'an•••@gmail.com', mine: false });
    expect((await ticketDetail(b, t!.id))?.mine).toBe(false);
    expect((await ticketDetail(a, t!.id))?.creator.mine).toBe(true);
  });
});
