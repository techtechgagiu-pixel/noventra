import { expect, it } from 'vitest';
import { scheduledRequestId } from '../../src/lib/jobs/scheduled-custom';

it('aceeași comandă în aceeași zi are mereu același identificator de cerere (fără loturi duble)', () => {
  const a = scheduledRequestId('zilnic-14', '2026-11-24');
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(scheduledRequestId('zilnic-14', '2026-11-24')).toBe(a);
  expect(scheduledRequestId('zilnic-14', '2026-11-25')).not.toBe(a);
});

import { isBannedMarket, isPlusHandicap } from '../../src/lib/jobs/analysis';
it('handicapurile „plus” nu se mai joacă, cele minus rămân', () => {
  expect(isPlusHandicap('AH:HOME:2.5')).toBe(true);
  expect(isPlusHandicap('AH:AWAY:0.5')).toBe(true);
  expect(isPlusHandicap('AH:HOME:-1.5')).toBe(false);
  expect(isPlusHandicap('EH:AWAY:0:3')).toBe(true);
  expect(isPlusHandicap('EH:HOME:1:0')).toBe(true);
  expect(isPlusHandicap('EH:HOME:0:1')).toBe(false);
  expect(isBannedMarket('AH:HOME:1.5')).toBe(true);
  expect(isBannedMarket('DC:1X')).toBe(false);
});
