import { afterEach, expect, it, vi } from 'vitest';
import { many } from '@/lib/db';
import { startSettlement } from '@/lib/settlement';

vi.mock('@/lib/db', () => ({ many: vi.fn(async () => []), one: vi.fn(async () => ({ name: 'settlement' })), query: vi.fn(async () => ({})) }));
afterEach(() => {
  const state = (globalThis as unknown as { __bmSettlement: { timer?: ReturnType<typeof setInterval> } }).__bmSettlement;
  clearInterval(state.timer); delete state.timer;
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks();
});

it('checks at startup and every five minutes, with only one scheduler per process', async () => {
  vi.useFakeTimers(); vi.stubEnv('BETMIND_DISABLE_WORKER', '0');
  startSettlement(); startSettlement();
  await vi.advanceTimersByTimeAsync(0);
  const first = vi.mocked(many).mock.calls.length;
  expect(first).toBeGreaterThan(0);
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(many).toHaveBeenCalledTimes(first * 2);
});

it('does no background work when the worker is disabled', async () => {
  vi.stubEnv('BETMIND_DISABLE_WORKER', '1');
  startSettlement();
  expect(many).not.toHaveBeenCalled();
});
