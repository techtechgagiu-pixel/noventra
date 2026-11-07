import { describe, expect, it } from 'vitest';
import { ticketRef } from '@/components/ticket-view';

describe('ticket numbers (owner request 07.11)', () => {
  it('shows „Biletul #N” when the ticket has a number and nothing for older tickets', () => {
    expect(ticketRef({ number: 249 })).toBe('Biletul #249 · ');
    expect(ticketRef({ number: null })).toBe('');
    expect(ticketRef({})).toBe('');
  });
});
