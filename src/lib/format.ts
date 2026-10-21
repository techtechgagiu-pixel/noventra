export const TZ = 'Europe/Bucharest';
export const fmtDateTime = (iso: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtTime = (iso: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
export const fmtDay = (d: string) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${d}T12:00:00Z`));
export const odds = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2));
export const STATUS_RO: Record<string, string> = { QUEUED: 'În coadă', RUNNING: 'Rulează', WAITING: 'Așteaptă limita furnizorului', PAUSED: 'În pauză', COMPLETED: 'Finalizat', INCOMPLETE: 'Incomplet', NO_BET: 'NO BET', FAILED: 'Eșuat' };
export const OUTCOME_RO: Record<string, string> = { PENDING: 'Meciuri în desfășurare', WON: 'Câștigat', LOST: 'Pierdut', VOID: 'Anulat', PARTIAL_VOID: 'Câștigat (cu anulări)', NOT_APPLICABLE: '—' };
export const AGENT_META: Record<string, { name: string; short?: string; title: string; accent: string; img: string }> = {
  victor: { name: 'Mircea Sandu', short: 'Sandu', title: 'Fost președinte FRF', accent: '#34d399', img: '/agents/victor.webp' },
  andrei: { name: 'Gheorghe Hagi', short: 'Hagi', title: 'Regele fotbalului românesc', accent: '#60a5fa', img: '/agents/andrei.webp' },
  mihai: { name: 'Gică Popescu', short: 'Popescu', title: 'Fost căpitan al echipei naționale', accent: '#f59e0b', img: '/agents/mihai.webp' },
  alex: { name: 'Adrian Mutu', short: 'Mutu', title: 'Fost atacant și selecționer U21', accent: '#f87171', img: '/agents/alex.webp' },
  diana: { name: 'Răzvan Raț', short: 'Raț', title: 'Fost fundaș stânga, analist TV', accent: '#a78bfa', img: '/agents/diana.webp' },
  robert: { name: 'Mircea Lucescu', short: 'M. Lucescu', title: 'Cel mai titrat antrenor român', accent: '#cbd5e1', img: '/agents/robert.webp' },
  ioana: { name: 'Cristi Chivu', short: 'Chivu', title: 'Fost căpitan, antrenor', accent: '#f472b6', img: '/agents/ioana.webp' },
  radu: { name: 'Răzvan Lucescu', short: 'R. Lucescu', title: 'Antrenor', accent: '#2dd4bf', img: '/agents/radu.webp' },
  elena: { name: 'Dumitru Dragomir', short: 'Dragomir', title: '„Mitică Dragomir”', accent: '#facc15', img: '/agents/elena.webp' },
  hantu: { name: 'Hanțu', short: 'Hanțu', title: 'Omul de știri · doar presa sportivă', accent: '#84cc16', img: '/agents/hantu.webp' },
  becali: { name: 'Gigi Becali', short: 'Becali', title: 'Patronul FCSB', accent: '#c084fc', img: '/agents/becali.webp' },
  cosmin: { name: 'Anghel Iordănescu', short: 'Iordănescu', title: 'Fost selecționer', accent: '#fb923c', img: '/agents/cosmin.webp' },
};
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Eroare ${res.status}`);
  return data as T;
}
