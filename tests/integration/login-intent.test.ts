import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { completeGoogleLogin, googleAuthUrl, hashAccessCode, issueInvitation, loginDestination, userFromToken } from '@/lib/auth';
import { POST as inviteLogin } from '@/app/auth/invite/route';
import { closePool, makeUser, resetDb } from './helpers';

const originalId = config.googleClientId;
const originalHash = config.ownerAccessCodeHash;
beforeEach(async () => { await resetDb(); config.googleClientId = 'home-client'; config.ownerAccessCodeHash = hashAccessCode('P11-ADMIN-HOME-TEST-0123456789ABCDEF'); });
afterEach(() => { config.googleClientId = originalId; config.ownerAccessCodeHash = originalHash; vi.unstubAllGlobals(); });
afterAll(closePool);

describe('fixed Custom destination after login', () => {
  it.each(['custom', 'https://foreign.example', '//foreign.example', '/admin/invitations', undefined])('preserves only the allowed intent through signed Google state: %s', async (intent) => {
    const auth = googleAuthUrl(intent);
    const saved = JSON.parse(Buffer.from(auth.cookie.split('.')[0], 'base64url').toString());
    const claims = { sub: 'home-google', email: 'home-google@test.local', email_verified: true, aud: config.googleClientId, iss: 'https://accounts.google.com', nonce: saved.nonce, exp: Math.floor(Date.now()/1000)+600 };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id_token: `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature` })));
    const session = await completeGoogleLogin('test-code', saved.state, auth.cookie);
    expect(session.destination).toBe(intent === 'custom' ? '/?tab=custom' : '/');
    expect((await userFromToken(session.token))?.role).toBe('user');
  });
  it('preserves the fixed intent for invitation codes and rejects arbitrary destinations', async () => {
    const owner = await makeUser();
    const invite = await issueInvitation(owner, 'Home flow');
    for (const next of ['custom', 'https://foreign.example']) {
      const req = new NextRequest('http://localhost:3100/auth/invite', { method: 'POST', headers: { origin: 'http://localhost:3100', 'x-forwarded-for': `home-${next}` }, body: new URLSearchParams({ code: invite.code, next }) });
      const response = await inviteLogin(req);
      expect(response.headers.get('location')).toBe(`http://localhost:3100${loginDestination(next)}`);
    }
  });
});
