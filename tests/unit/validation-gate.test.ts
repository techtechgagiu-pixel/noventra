import { expect, it } from 'vitest';
import { validationGate } from '@/lib/d1/validation-gate';

it('keeps a real-data validation deployment closed before and after secret installation', () => {
  const req = new Request('https://validation.example/api/statistics');
  expect(validationGate(req, 'cloudflare-validation')?.status).toBe(403);
  expect(validationGate(req, 'cloudflare-validation', 'private-key')?.status).toBe(403);
  const allowed = new Request(req, { headers: { 'x-p11-validation': 'private-key' } });
  expect(validationGate(allowed, 'cloudflare-validation', 'private-key')).toBeNull();
  expect(validationGate(allowed, 'cloudflare-validation', 'different-key')?.status).toBe(403);
});

it('leaves production auth and the separately HMAC-protected database bridge in charge', () => {
  expect(validationGate(new Request('https://app.example/login'), 'cloudflare-staging')).toBeNull();
  expect(validationGate(new Request('https://validation.example/_internal/database'), 'cloudflare-validation')).toBeNull();
});
