export const TZ = 'Europe/Bucharest';
export const fmtDateTime = (iso: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtTime = (iso: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
export const fmtDay = (d: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${d}T12:00:00Z`));
export const odds = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));
export const STATUS_RO: Record<string, string> = { QUEUED: 'În coadă', RUNNING: 'Rulează', WAITING: 'Așteaptă limita furnizorului', PAUSED: 'În pauză', COMPLETED: 'Finalizat', INCOMPLETE: 'Incomplet', NO_BET: 'NO BET', FAILED: 'Eșuat' };
export const OUTCOME_RO: Record<string, string> = { PENDING: 'Meciuri în desfășurare', WON: 'Câștigat', LOST: 'Pierdut', VOID: 'Anulat', PARTIAL_VOID: 'Câștigat (cu anulări)', NOT_APPLICABLE: '—' };
export const AGENT_META: Record<string, { name: string; title: string; accent: string; img: string }> = {
  victor: { name: 'Victor', title: 'Strategul', accent: '#34d399', img: '/agents/victor.webp' },
  andrei: { name: 'Andrei', title: 'Matematicianul', accent: '#60a5fa', img: '/agents/andrei.webp' },
  mihai: { name: 'Mihai', title: 'Veteranul', accent: '#f59e0b', img: '/agents/mihai.webp' },
  alex: { name: 'Alex', title: 'Vânătorul de cote', accent: '#f87171', img: '/agents/alex.webp' },
  diana: { name: 'Diana', title: 'Tacticiana', accent: '#a78bfa', img: '/agents/diana.webp' },
  robert: { name: 'Robert', title: 'Managerul de risc', accent: '#cbd5e1', img: '/agents/robert.webp' },
};
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Eroare ${res.status}`);
  return data as T;
}
