import { describe, expect, it } from 'vitest';
import { cleanAgentText, cleanPayload } from '@/lib/agent-names';

describe('old agent names', () => {
  it('replaces the early placeholder names with the personas, but not real full names', () => {
    expect(cleanAgentText('Alex și Elena propun selecții')).toBe('Adrian Mutu și Dumitru Dragomir propun selecții');
    expect(cleanAgentText('Contest argumentul lui Radu și Victor.')).toBe('Contest argumentul lui Răzvan Lucescu și Mircea Sandu.');
    expect(cleanAgentText('Mihai Stoica și Radu Drăgușin contestă')).toBe('Mihai Stoica și Radu Drăgușin contestă');
    expect(cleanAgentText('Alexandru')).toBe('Alexandru');
    expect(cleanPayload({ rationale: 'Andrei, Cosmin și Mihai au dreptate', marketKey: 'DC:1X' })).toEqual({ rationale: 'Gheorghe Hagi, Anghel Iordănescu și Gică Popescu au dreptate', marketKey: 'DC:1X' });
  });
});
