import { describe, expect, it } from 'vitest';
import { queueText } from '@/components/job-queue';

describe('queue text', () => {
  it('first in line', () => expect(queueText(1, 21)).toBe('ești primul la rând, ~21 min'));
  it('Nth in line', () => expect(queueText(5, 63)).toBe('ești al 5-lea în coadă, ~63 min'));
  it('no estimate', () => expect(queueText(2, null)).toBe('ești al 2-lea în coadă'));
});
