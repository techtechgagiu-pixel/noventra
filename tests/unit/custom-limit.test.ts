import { describe, expect, it } from 'vitest';
import { customLimitFor } from '@/lib/ticket-removal';

describe('daily custom-ticket limit per account', () => {
  it('uses the limit the owner set for an account, else the default; the owner keeps 30', () => {
    expect(customLimitFor({ email: 'friend@test.local', customDailyLimit: 10 })).toBe(10);
    expect(customLimitFor({ email: 'new@test.local', customDailyLimit: null })).toBe(1);
    expect(customLimitFor({ email: 'new@test.local' })).toBe(1);
    expect(customLimitFor({ email: 'admin@test.local', role: 'admin', customDailyLimit: 5 })).toBe(30);
    expect(customLimitFor({ email: 'x@test.local', customDailyLimit: 99 })).toBe(30);
  });
});
