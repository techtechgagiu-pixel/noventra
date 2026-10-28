/**
 * Builds a PNG of a finished ticket in the browser (no server, no paid service) for WhatsApp / Instagram / Facebook.
 * Only what is on the ticket itself: matches, picks, odds, scores and the result. No creator, no account data.
 */
export type ShareLeg = { home: string; away: string; league: string; kickoff: string; label: string; odds: number; outcome: string; homeScore: number | null; awayScore: number | null };
export type ShareTicket = { title: string; createdAt: string; actualOdds: number | null; outcomeStatus: string; legs: ShareLeg[] };

const C = { ink: '#0b1d15', stripe: '#0f261c', panel: '#112b20', line: '#275341', amber: '#ffbe3d', green: '#7fdc6c', rose: '#ff6150', text: '#eef5ec', muted: '#a3bcad' };
const W = 1080;
const PAD = 72;
const ROW = 132;
const MAX_LEGS = 10;

const fmtOdds = (n: number | null) => (n == null ? '—' : n.toFixed(2));
const fmtWhen = (iso: string) => new Intl.DateTimeFormat('ro-RO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }).format(new Date(iso));
const fmtDay = (iso: string) => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }).format(new Date(iso));

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function fontVar(name: string, fallback: string) {
  const v = typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
}

export function shareHeight(legCount: number) {
  const shown = Math.min(legCount, MAX_LEGS) + (legCount > MAX_LEGS ? 0.5 : 0);
  return Math.max(1080, Math.round(560 + shown * ROW + 210));
}

export async function renderShareImage(t: ShareTicket): Promise<Blob> {
  const board = fontVar('--font-board', '"Barlow Condensed", "Arial Narrow", sans-serif');
  const body = fontVar('--font-body', 'Barlow, Arial, sans-serif');
  await Promise.all([`800 80px ${board}`, `700 40px ${board}`, `600 30px ${body}`, `400 26px ${body}`].map((f) => document.fonts?.load(f, 'ĂÂÎȘȚăâîșț0123456789').catch(() => null)));
  const logo = await loadImage('/logo.svg');

  const H = shareHeight(t.legs.length);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Pitch: mown stripes, a soft floodlight, halfway line.
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.stripe; for (let x = 0; x < W; x += 216) ctx.fillRect(x, 0, 108, H);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 760);
  glow.addColorStop(0, 'rgba(255,227,150,.16)'); glow.addColorStop(1, 'rgba(255,227,150,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  const won = t.outcomeStatus === 'WON' || t.outcomeStatus === 'PARTIAL_VOID';
  const lost = t.outcomeStatus === 'LOST';
  const accent = won ? C.green : lost ? C.rose : C.amber;

  // Header: logo + wordmark, date on the right.
  let y = PAD;
  if (logo) ctx.drawImage(logo, PAD, y, 72, 72);
  ctx.textBaseline = 'middle';
  ctx.font = `800 46px ${board}`; ctx.fillStyle = C.text; ctx.fillText('PRIMUL', PAD + 92, y + 38);
  const pw = ctx.measureText('PRIMUL ').width;
  ctx.fillStyle = C.amber; ctx.fillText('11', PAD + 92 + pw, y + 38);
  ctx.font = `400 26px ${body}`; ctx.fillStyle = C.muted; ctx.textAlign = 'right';
  ctx.fillText(fmtDay(t.createdAt), W - PAD, y + 38); ctx.textAlign = 'left';

  // Result banner.
  y += 120;
  const banner = won ? '✓ BILET CÂȘTIGAT' : lost ? '✗ BILET PIERDUT' : 'BILET ÎN JOC';
  const hits = t.legs.filter((l) => l.outcome === 'WON').length;
  ctx.font = `800 40px ${board}`;
  const bw = ctx.measureText(banner).width + 56;
  ctx.fillStyle = won ? 'rgba(127,220,108,.16)' : lost ? 'rgba(255,97,80,.16)' : 'rgba(255,190,61,.14)';
  ctx.strokeStyle = accent; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(PAD, y, bw, 64, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent; ctx.fillText(banner, PAD + 28, y + 33);
  if (won || lost) { ctx.font = `600 28px ${body}`; ctx.fillStyle = C.muted; ctx.fillText(`${hits}/${t.legs.length} meciuri au intrat`, PAD + bw + 24, y + 33); }

  // Title and total odds.
  y += 110;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 64px ${board}`; ctx.fillStyle = C.text;
  ctx.fillText(fit(ctx, t.title.toUpperCase(), 560), PAD, y + 60);
  ctx.font = `400 26px ${body}`; ctx.fillStyle = C.muted;
  ctx.fillText(`${t.legs.length} meciuri · cote observate la creare`, PAD, y + 104);
  ctx.textAlign = 'right';
  ctx.font = `600 26px ${body}`; ctx.fillText('COTA TOTALĂ', W - PAD, y - 4);
  ctx.font = `800 150px ${board}`; ctx.fillStyle = C.amber;
  ctx.shadowColor = 'rgba(255,190,61,.35)'; ctx.shadowBlur = 30;
  ctx.fillText(fmtOdds(t.actualOdds), W - PAD, y + 120);
  ctx.shadowBlur = 0; ctx.textAlign = 'left';

  // Slip with the legs.
  y += 170;
  const shown = t.legs.slice(0, MAX_LEGS);
  const slipH = shown.length * ROW + (t.legs.length > MAX_LEGS ? 64 : 0) + 24;
  ctx.fillStyle = 'rgba(17,43,32,.92)'; ctx.strokeStyle = won ? 'rgba(127,220,108,.7)' : C.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(PAD - 16, y, W - 2 * PAD + 32, slipH, 22); ctx.fill(); ctx.stroke();
  ctx.setLineDash([10, 10]); ctx.strokeStyle = 'rgba(238,245,236,.16)';
  ctx.beginPath(); ctx.moveTo(PAD + 4, y + 18); ctx.lineTo(PAD + 4, y + slipH - 18); ctx.stroke(); ctx.setLineDash([]);

  let ry = y + 12;
  shown.forEach((l, i) => {
    const left = PAD + 32;
    const right = W - PAD - 8;
    if (i > 0) { ctx.strokeStyle = 'rgba(238,245,236,.08)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(left, ry); ctx.lineTo(right, ry); ctx.stroke(); }
    const mark = l.outcome === 'WON' ? C.green : l.outcome === 'LOST' ? C.rose : C.muted;
    ctx.font = `400 22px ${body}`; ctx.fillStyle = C.muted;
    ctx.fillText(fit(ctx, `${l.league} · ${fmtWhen(l.kickoff)}`, 640), left, ry + 38);
    ctx.font = `700 38px ${board}`; ctx.fillStyle = C.text;
    ctx.fillText(fit(ctx, `${l.home} – ${l.away}`, 640), left, ry + 80);
    ctx.font = `600 25px ${body}`; ctx.fillStyle = C.amber;
    ctx.fillText(fit(ctx, l.label, 640), left, ry + 114);
    ctx.textAlign = 'right';
    ctx.font = `800 52px ${board}`; ctx.fillStyle = C.text;
    ctx.fillText(fmtOdds(l.odds), right, ry + 70);
    const scored = l.homeScore != null && l.awayScore != null && l.outcome !== 'PENDING';
    const tag = l.outcome === 'WON' ? '✓ a intrat' : l.outcome === 'LOST' ? '✗ nu a intrat' : l.outcome === 'VOID' ? 'anulat' : 'în așteptare';
    ctx.font = `600 24px ${body}`; ctx.fillStyle = mark;
    ctx.fillText(scored ? `${l.homeScore}-${l.awayScore} · ${tag}` : tag, right, ry + 112);
    ctx.textAlign = 'left';
    ry += ROW;
  });
  if (t.legs.length > MAX_LEGS) { ctx.font = `600 26px ${body}`; ctx.fillStyle = C.muted; ctx.fillText(`+ încă ${t.legs.length - MAX_LEGS} meciuri pe bilet`, PAD + 32, ry + 40); }

  // Footer.
  ctx.font = `700 30px ${board}`; ctx.fillStyle = C.text;
  ctx.fillText('Agenții dezbat. Tu primești biletul.', PAD, H - PAD - 44);
  ctx.font = `400 22px ${body}`; ctx.fillStyle = C.muted;
  ctx.fillText('primul11.noventra.ro · 18+ · Analiza nu garantează rezultatul', PAD, H - PAD);

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Imaginea nu a putut fi creată.'))), 'image/png'));
}

/** Share sheet on phones (WhatsApp, Instagram…); download elsewhere. Returns what happened. */
export async function shareTicketImage(t: ShareTicket): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderShareImage(t);
  const name = `primul11-${t.title.replace(/\W+/g, '-').toLowerCase()}-${t.createdAt.slice(0, 10)}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `PRIMUL 11 · ${t.title}`, text: 'primul11.noventra.ro' }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
