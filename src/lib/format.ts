import { AGENT_ROLES, modelAgentName, modelPortrait } from './model-identities';

export const TZ = 'Europe/Bucharest';
export const fmtDateTime = (iso: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtTime = (iso: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
export const fmtDay = (d: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${d}T12:00:00Z`));
export const odds = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));
export const STATUS_RO: Record<string, string> = { QUEUED: 'În coadă', RUNNING: 'Rulează', WAITING: 'Așteaptă limita furnizorului', PAUSED: 'În pauză', COMPLETED: 'Finalizat', INCOMPLETE: 'Incomplet', NO_BET: 'NO BET', FAILED: 'Eșuat' };
export const OUTCOME_RO: Record<string, string> = { PENDING: 'În așteptare', WON: 'Câștigat', LOST: 'Pierdut', VOID: 'Anulat', PARTIAL_VOID: 'Câștigat (cu anulări)', NOT_APPLICABLE: '—' };
const ACCENTS: Record<string, string> = {
  "corina": "#ec4899",
  "victor": "#34d399",
  "andrei": "#60a5fa",
  "mihai": "#f59e0b",
  "alex": "#f87171",
  "diana": "#a78bfa",
  "robert": "#cbd5e1",
  "ioana": "#f472b6",
  "radu": "#2dd4bf",
  "elena": "#facc15",
  "hantu": "#84cc16",
  "becali": "#c084fc",
  "ilie": "#38bdf8",
  "sumudica": "#d946ef",
  "petrescu": "#eab308",
  "stoica": "#f43f5e",
  "prunea": "#14b8a6",
  "porumboiu": "#cbd5e1",
  "ianis": "#facc15",
  "dragusin": "#6366f1",
  "man": "#fb7185",
  "tamas": "#22c55e",
  "cosmin": "#fb923c",
  "nova": "#e4a15c",
  "sigma": "#8eafff",
  "atlas": "#6edbc4",
  "argus": "#d7b4a0",
  "orion": "#a6c5fa",
  "prisma": "#b8a5f0",
  "mnemos": "#c2a6df",
  "nexus": "#8ac86e",
  "vector": "#ed9a71",
  "fulger": "#e1da81",
  "scout": "#22d3ee"
};
export const AGENT_META: Record<string, { name: string; short: string; title: string; accent: string; img: string }> = Object.fromEntries(Object.entries(AGENT_ROLES).map(([id,title]) => [id, { name: modelAgentName(id), short: modelAgentName(id), title, accent: ACCENTS[id] ?? '#22d3ee', img: modelPortrait(id)! }]));
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Eroare ${res.status}`);
  return data as T;
}
