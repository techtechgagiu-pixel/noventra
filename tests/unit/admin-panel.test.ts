import { expect, it } from 'vitest';
import { adjustCredits } from '@/lib/credits';

it('rejects invalid admin credit changes before touching the database', async () => {
  await expect(adjustCredits('u', 0, 'a')).rejects.toThrow();
  await expect(adjustCredits('u', 1.5, 'a')).rejects.toThrow();
  await expect(adjustCredits('u', 1_000_000, 'a')).rejects.toThrow();
});
