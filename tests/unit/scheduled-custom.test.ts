import { expect, it } from 'vitest';
import { scheduledRequestId } from '../../src/lib/jobs/scheduled-custom';

it('aceeași comandă în aceeași zi are mereu același identificator de cerere (fără loturi duble)', () => {
  const a = scheduledRequestId('zilnic-14', '2026-11-24');
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(scheduledRequestId('zilnic-14', '2026-11-24')).toBe(a);
  expect(scheduledRequestId('zilnic-14', '2026-11-25')).not.toBe(a);
});
