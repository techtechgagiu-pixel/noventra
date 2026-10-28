/**
 * Real-time "tactical map" of the agents, drawn on a canvas at the display's refresh rate (60, 90, 120 Hz: every
 * motion is time-based, so it is as smooth as the screen allows).
 * Pure rendering: it only visualises recorded job events (never invents activity). React owns the events;
 * the scene consumes them through a small queue so bursts of events play out as a fluent flow.
 */
import { LEGACY_VOTER_IDS } from '@/lib/agent-roster';
import { NEW_AI_PROFILES } from '@/lib/ai/new-agent-profiles';
import { AGENT_META } from '@/lib/format';
import type { NexusEvent } from '@/lib/nexus-state';

type Vec = { x: number; y: number };
type FxState = 'QUEUED' | 'RESEARCH' | 'ANALYSIS' | 'DEBATE' | 'VOTING' | 'ACCEPTED' | 'REJECTED';
type Fx = {
  id: string; home: string; away: string; state: FxState; pos: Vec; alpha: number; order: number; flash: number; flashColor: string;
  odds: number | null; market: string | null; votes: string | null; acceptedIndex: number; seen: boolean; chosen: boolean; verdict?: string;
};
type AgentStatus = 'IDLE' | 'ANALYZING' | 'DEBATING' | 'DONE' | 'FAILED' | 'WAITING';
type AgentNode = {
  id: string; status: AgentStatus; pulse: number; bubble: { text: string; color: string; t0: number } | null; picks: Record<string, string | null>; activity: number;
  /** Spring-driven offset from the formation spot (jogging, running to meet the ball, lunging on a kick). */
  off: Vec; vel: Vec; phase: number;
};
type Ref = { k: 'agent'; id: string } | { k: 'fx'; id: string } | { k: 'src' } | { k: 'news' } | { k: 'tray' }
  | { k: 'goal'; off: number; depth: number } | { k: 'post'; side: number } | { k: 'center' } | { k: 'pt'; x: number; y: number };
type Packet = { from: Ref; to: Ref; t0: number; dur: number; color: string; size: number; bend: number; done?: () => void };
type Burst = { at: Ref; t0: number; dur: number; color: string; r: number };
type Particle = { x: number; y: number; vx: number; vy: number; t0: number; life: number; color: string; size: number; spin: number; g: number; kind?: 'spark' | 'rocket' };
type KickKind = 'pass' | 'shot' | 'bounce' | 'reset';
type Flight = { from: Vec; z0: number; to: Ref; t0: number; dur: number; h: number; kind: KickKind; curve: number };
type Step = { to: Ref; kind: KickKind; onArrive?: (t: number) => void; hold?: number };
type Ball = { pos: Vec; z: number; spin: number; owner: Ref | null; flight: Flight | null; step: Step | null; plan: Step[]; holdUntil: number; pop: number; trail: Array<{ x: number; y: number }> };
const MAX_PARTICLES = 900;
type Callout = { text: string; color: string; t0: number; dur: number; big: boolean };
type Layout = {
  mode: 'wide' | 'tall'; w: number; h: number; r: number;
  pitch: { x: number; y: number; w: number; h: number };
  agents: Record<string, Vec>; src: Vec; news: Vec; discard: Vec;
  queue: { x: number; y: number; w: number; h: number };
  active: { x: number; y: number; w: number; h: number };
  tray: { x: number; y: number; w: number; h: number };
};

/** Two teams on one pitch: PRIMUL 11 (left, attacking right) and the second team (right, attacking left). */
export const FORMATION: Array<{ id: string; u: number; v: number; line: string }> = [
  ...NEW_AI_PROFILES.map((a, i) => ({ id: a.id, u: .1 + (i % 5) * .2, v: i < 5 ? -.12 : 1.12, line: a.title.split(' · ')[0] })),
  { id: 'robert', u: 0.04, v: 0.5, line: 'Portar · creierul' },
  { id: 'victor', u: 0.14, v: 0.12, line: 'Apărare' }, { id: 'mihai', u: 0.14, v: 0.37, line: 'Apărare' },
  { id: 'radu', u: 0.14, v: 0.63, line: 'Apărare' }, { id: 'elena', u: 0.14, v: 0.88, line: 'Apărare' },
  { id: 'diana', u: 0.27, v: 0.12, line: 'Mijloc' }, { id: 'hantu', u: 0.25, v: 0.37, line: 'Mijloc' }, { id: 'becali', u: 0.25, v: 0.63, line: 'Mijloc · patronul' }, { id: 'ioana', u: 0.27, v: 0.88, line: 'Mijloc' },
  { id: 'cosmin', u: 0.39, v: 0.2, line: 'Atac' }, { id: 'alex', u: 0.42, v: 0.5, line: 'Atac' }, { id: 'andrei', u: 0.39, v: 0.8, line: 'Atac' },
  { id: 'porumboiu', u: 0.5, v: 0.04, line: 'VAR · pe margine' },
  { id: 'corina', u: 0.5, v: 0.96, line: 'Redacția sportivă · fără voturi' },
  { id: 'prunea', u: 0.96, v: 0.5, line: 'Echipa a doua · portar' },
  { id: 'dragusin', u: 0.86, v: 0.22, line: 'Echipa a doua · apărare' }, { id: 'petrescu', u: 0.87, v: 0.5, line: 'Echipa a doua · apărare' }, { id: 'tamas', u: 0.86, v: 0.78, line: 'Echipa a doua · apărare' },
  { id: 'ilie', u: 0.74, v: 0.16, line: 'Echipa a doua · mijloc' }, { id: 'stoica', u: 0.73, v: 0.5, line: 'Echipa a doua · mijloc' }, { id: 'ianis', u: 0.74, v: 0.84, line: 'Echipa a doua · mijloc' },
  { id: 'sumudica', u: 0.6, v: 0.3, line: 'Echipa a doua · atac' }, { id: 'man', u: 0.6, v: 0.7, line: 'Echipa a doua · atac' },
];
const BRAIN = 'robert';
const NEW_IDS = new Set<string>(NEW_AI_PROFILES.map((a) => a.id));
type Spot = { u: number; v: number };
/**
 * Positions only the agents that actually play this job. Without any of the new agents the classic two-team
 * formation is kept; otherwise the selected squad is spread in columns across the whole pitch, brain in goal,
 * press (corina) and VAR (porumboiu) on the touchlines, so nobody sits outside the field or on the bench.
 */
export function autoFormation(active: Set<string> | null): Record<string, Spot> {
  const ids = FORMATION.map((f) => f.id).filter((id) => !active || active.has(id) || id === 'corina' || id === BRAIN);
  if (!ids.some((id) => NEW_IDS.has(id))) return Object.fromEntries(FORMATION.filter((f) => ids.includes(f.id)).map((f) => [f.id, { u: f.u, v: f.v }]));
  const out: Record<string, Spot> = { [BRAIN]: { u: 0.04, v: 0.5 } };
  if (ids.includes('corina')) out.corina = { u: 0.5, v: 1.1 };
  if (ids.includes('porumboiu')) out.porumboiu = { u: 0.5, v: -0.1 };
  const rest = [...ids.filter((id) => !NEW_IDS.has(id)), ...ids.filter((id) => NEW_IDS.has(id))].filter((id) => !(id in out));
  const rows = rest.length <= 8 ? 3 : rest.length <= 15 ? 4 : 5;
  const cols = Math.max(1, Math.ceil(rest.length / rows));
  rest.forEach((id, i) => {
    const c = Math.floor(i / rows); const inCol = Math.min(rows, rest.length - c * rows); const j = i % rows;
    out[id] = { u: cols === 1 ? 0.5 : 0.16 + c * (0.8 / (cols - 1)), v: 0.08 + ((j + 0.5) / inCol) * 0.84 };
  });
  return out;
}
const CONFETTI = ['#7fdc6c', '#ffe36e', '#ffbe3d', '#ff6150', '#8fd0ff', '#eef5ec'];
const newBall = (): Ball => ({ pos: { x: 0, y: 0 }, z: 0, spin: 0, owner: null, flight: null, step: null, plan: [], holdUntil: 0, pop: 0, trail: [] });
/** Stable per-agent phase so every player jogs to his own rhythm. */
const phaseOf = (id: string) => { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9973; return (h / 9973) * Math.PI * 2; };
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
// Floodlit-pitch palette (matches the site): amber data, chalk text, football result colours.
const C = { cyan: '#ffbe3d', emerald: '#7fdc6c', gold: '#ffe36e', rose: '#ff6150', violet: '#8fd0ff', muted: '#a3bcad', text: '#eef5ec', lime: '#c8f07a', line: '#275341' };
const NAME = (id: string) => AGENT_META[id]?.short ?? AGENT_META[id]?.name ?? id;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const teamShort = (t: string) => cut(t.replace(/^(FC|AFC|CF|SC|AC|SS|SL|RC|CD|UD|SD)\s+/i, '').replace(/\s+(FC|CF|SC|AFC)$/i, ''), 14);
const code = (t: string) => teamShort(t).replace(/[^A-Za-zĂÂÎȘȚăâîșț]/g, '').slice(0, 3).toUpperCase();

export type SceneHooks = { onProgress?: (seq: number) => void; onAgentHover?: (id: string | null) => void };

export class MapScene {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private L!: Layout;
  private bg: HTMLCanvasElement | null = null;
  private portraits = new Map<string, HTMLImageElement>();
  private sprites = new Map<string, HTMLCanvasElement>();
  private glow = new Map<string, HTMLCanvasElement>();
  private fx = new Map<string, Fx>();
  private agents = new Map<string, AgentNode>();
  private activeAgents: Set<string> | null = null;
  private formation: Record<string, Spot> = autoFormation(null);
  private spawnAt = new Map<string, number>();
  private particles: Particle[] = [];
  private callout: Callout | null = null;
  private ball: Ball = newBall();
  private now = 0;
  private shake: { t0: number; amp: number; dur: number } | null = null;
  private flashFx: { t0: number; dur: number; color: string; at: Vec | null } | null = null;
  private netHit: { t0: number; off: number } | null = null;
  private postHit: { t0: number; side: number } | null = null;
  private celebrate = 0;
  /** Accepted selections ("goals"): total from the events, shown = what the animation has scored so far. */
  private goalsTotal = 0;
  private goalsShown = 0;
  private goalPulse = 0;
  private ballSprite: HTMLCanvasElement | null = null;
  private packets: Packet[] = [];
  private bursts: Burst[] = [];
  private dust: Array<{ x: number; y: number; vx: number; vy: number; a: number }> = [];
  private queue: Array<{ e: NexusEvent; animate: boolean }> = [];
  private nextAt = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private font = 'ui-sans-serif, system-ui, sans-serif';
  private fpsAcc = { frames: 0, t0: 0, value: 0 };
  private hover: string | null = null;
  private stage = 'QUEUED';
  private banner: { text: string; color: string } | null = null;
  private final: { totalOdds: number | null; generation: string; legs: number; target: number } | null = null;
  private acceptedCount = 0;
  private reviewCounts: { solid: number; risky: number; weak: number } | null = null;
  private target = 0;
  private lastSeq = 0;
  speed = 1;
  reducedMotion = false;

  constructor(private canvas: HTMLCanvasElement, private hooks: SceneHooks = {}) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (const f of FORMATION) this.agents.set(f.id, { id: f.id, status: 'IDLE', pulse: 0, bubble: null, picks: {}, activity: 0, off: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, phase: phaseOf(f.id) });
    for (const f of FORMATION) {
      const img = new Image();
      img.decoding = 'async';
      img.src = AGENT_META[f.id]?.img ?? '';
      img.onload = () => { this.portraits.set(f.id, img); this.sprites.delete(f.id); };
    }
    if (typeof document !== 'undefined') this.font = getComputedStyle(document.body).fontFamily || this.font;
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', this.onLeave);
  }

  destroy() {
    this.stop();
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
  }

  /** Resets everything (used by replay). */
  reset() {
    this.fx.clear(); this.packets = []; this.bursts = []; this.particles = []; this.callout = null; this.ball = newBall(); this.shake = null; this.flashFx = null; this.netHit = null; this.postHit = null; this.celebrate = 0; this.goalsTotal = 0; this.goalsShown = 0; this.setSquad(null, 0); this.queue = []; this.final = null; this.banner = null; this.acceptedCount = 0; this.stage = 'QUEUED'; this.lastSeq = 0;
    for (const a of this.agents.values()) Object.assign(a, { status: 'IDLE', pulse: 0, bubble: null, picks: {}, activity: 0, off: { x: 0, y: 0 }, vel: { x: 0, y: 0 } });
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.L = layout(cssW, cssH, this.formation);
    this.bg = null; this.sprites.clear(); this.glow.clear(); this.ballSprite = null;
    if (!this.dust.length) for (let i = 0; i < 40; i++) this.dust.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.006, vy: (Math.random() - 0.5) * 0.004, a: 0.15 + Math.random() * 0.35 });
    if (!this.running) this.draw(performance.now());
  }

  /** Feeds events. animate=false applies them instantly (history at page open). */
  push(events: NexusEvent[], animate: boolean) {
    for (const e of events) {
      if (e.seq <= this.lastSeq) continue;
      this.lastSeq = e.seq;
      if (!animate || this.reducedMotion) { this.apply(e, false); this.hooks.onProgress?.(e.seq); }
      else this.queue.push({ e, animate: true });
    }
  }

  setTarget(t: number) { this.target = t; }
  pending() { return this.queue.length; }
  /** Keep the transcript current while its canvas is outside the viewport. */
  flush() {
    while(this.queue.length){const item=this.queue.shift()!;this.apply(item.e,false);this.hooks.onProgress?.(item.e.seq);}
    this.nextAt=0;
  }
  fps() { return this.fpsAcc.value; }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => { if (!this.running) return; this.frame(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  // ── Input ───────────────────────────────────────────────────────────────
  private onMove = (ev: PointerEvent) => {
    if (!this.L) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left; const y = ev.clientY - rect.top;
    let hit: string | null = null;
    for (const id of Object.keys(this.L.agents)) { const p = this.agentPos(id); if (Math.hypot(p.x - x, p.y - y) < this.L.r * 1.25) hit = id; }
    if (hit !== this.hover) { this.hover = hit; this.canvas.style.cursor = hit ? 'pointer' : 'default'; this.hooks.onAgentHover?.(hit); }
  };
  private onLeave = () => { if (this.hover) { this.hover = null; this.hooks.onAgentHover?.(null); } };

  // ── Event → scene ───────────────────────────────────────────────────────
  private isActive(id: string) { return id in this.formation; }
  /** Puts exactly the selected squad on the pitch (and nobody else), with a short staggered entrance. */
  private setSquad(ids: readonly string[] | null, now: number) {
    this.activeAgents = ids ? new Set(ids) : null;
    this.formation = autoFormation(this.activeAgents);
    this.spawnAt.clear();
    Object.keys(this.formation).forEach((id, i) => this.spawnAt.set(id, now + i * 45));
    if (this.L) this.L = layout(this.L.w, this.L.h, this.formation);
  }
  private confetti(at: Vec, n: number, now: number, opts: { colors?: string[]; speed?: number; delay?: number; gravity?: number; life?: number } = {}) {
    if (this.reducedMotion) return;
    const colors = opts.colors ?? CONFETTI;
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2; const sp = (opts.speed ?? 160) * (0.35 + Math.random() * 0.8);
      this.particles.push({ x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.speed ?? 160) * 0.35, t0: now + (opts.delay ?? 0), life: (opts.life ?? 1400) * (0.7 + Math.random() * 0.5), color: colors[i % colors.length], size: 2 + Math.random() * 3, spin: Math.random() * 6, g: opts.gravity ?? 260 });
    }
  }
  private shout(text: string, color: string, now: number, big = false, dur = 1500) { if (!this.reducedMotion) this.callout = { text, color, t0: now, dur: dur / this.speed, big }; }
  /** A pass to someone (a vote, an objection). Ignored while a goal move is being played, so goals are never cut. */
  private kick(to: Ref) {
    if (this.reducedMotion || !this.L) return;
    const b = this.ball; const t = performance.now();
    if (b.plan.length || (b.flight && b.flight.kind !== 'pass') || t < b.holdUntil) return;
    if (to.k === 'agent' && b.owner?.k === 'agent' && b.owner.id === to.id && !b.flight) return;
    this.launch({ to, kind: 'pass' }, t);
  }
  private say(id: string, text: string, color: string, now: number) { const a = this.agents.get(id); if (a) { a.bubble = { text: cut(text, 34), color, t0: now }; a.pulse = now; a.activity = 1; } }
  private send(from: Ref, to: Ref, color: string, now: number, opts: { size?: number; dur?: number; delay?: number; bend?: number; done?: () => void } = {}) {
    if (this.reducedMotion) { opts.done?.(); return; }
    this.packets.push({ from, to, color, t0: now + (opts.delay ?? 0), dur: (opts.dur ?? 900) / this.speed, size: opts.size ?? 1, bend: opts.bend ?? (Math.random() - 0.5) * 0.5, done: opts.done });
  }
  private burst(at: Ref, color: string, now: number, r = 1, dur = 900) { if (!this.reducedMotion) this.bursts.push({ at, color, t0: now, dur: dur / this.speed, r }); }
  private setFx(id: string, patch: Partial<Fx>) { const f = this.fx.get(id); if (f) Object.assign(f, patch); }

  private apply(e: NexusEvent, anim: boolean) {
    const now = performance.now();
    const p = e.payload ?? {};
    const A = (id: string): Ref => ({ k: 'agent', id });
    const F = (id: string): Ref => ({ k: 'fx', id });
    const go = anim;
    switch (e.type) {
      case 'JOB_CREATED':
        this.setSquad(Array.isArray(p.custom?.agents) && p.custom.agents.length ? p.custom.agents as string[] : Array.isArray(p.agentIds) ? p.agentIds as string[] : LEGACY_VOTER_IDS, go ? now : 0);
        if (go) { this.shout(`${Object.keys(this.formation).length} agenți intră pe teren`, C.cyan, now, false, 1800); this.ball = newBall(); this.ball.pop = now; }
        break;
      case 'TARGET_SELECTED': this.target = Number(p.target) || this.target; break;
      case 'STAGE_CHANGED': this.stage = e.stage; this.banner = null; break;
      case 'CANDIDATE_SELECTED': {
        const order = (p.order ?? []) as Array<{ fixtureId: string; match: string }>;
        order.forEach((o, i) => {
          if (this.fx.has(o.fixtureId)) return;
          const [home, away] = String(o.match ?? '').split(' – ');
          const start = this.L ? { x: this.L.queue.x + this.L.queue.w / 2, y: this.L.queue.y - 30 } : { x: 0, y: 0 };
          this.fx.set(o.fixtureId, { id: o.fixtureId, home: home ?? o.fixtureId, away: away ?? '', state: 'QUEUED', pos: start, alpha: 0, order: i, flash: 0, flashColor: C.cyan, odds: null, market: null, votes: null, acceptedIndex: -1, seen: false, chosen: false });
        });
        if (go) this.burst({ k: 'src' }, C.cyan, now, 1.4);
        break;
      }
      case 'BATCH_STARTED':
        ((Array.isArray(p.fixtures) ? p.fixtures : []) as string[]).forEach((id, i) => { this.setFx(id, { state: 'RESEARCH' }); if (go) this.send({ k: 'src' }, F(id), C.cyan, now, { delay: i * 90, size: 1.2 }); });
        break;
      case 'SCOUT_COMPLETED': case 'STATS_COMPLETED':
        if (e.fixtureId && go) { this.send({ k: 'src' }, F(e.fixtureId), e.type === 'SCOUT_COMPLETED' ? C.cyan : C.violet, now, { size: 0.8 }); this.setFx(e.fixtureId, { flash: now, flashColor: C.cyan }); }
        break;
      case 'NEWS_COMMENTARY':
        if (go) this.send({ k: 'news' }, A('corina'), '#ec4899', now, { done: () => this.say('corina', cut(String(p.commentary ?? ''), 60), '#ec4899', performance.now()) });
        break;
      case 'RESEARCH_BRIEF':
        if (go && e.fixtureId) { const rep = this.isActive('hantu') ? 'hantu' : 'corina'; this.send({ k: 'src' }, A(rep), C.lime, now, { size: 1, done: () => { const t2 = performance.now(); this.say(rep, `🔎 dosar · ${cut(String(p.match ?? ''), 20)}`, C.lime, t2); this.send(A(rep), F(e.fixtureId!), C.lime, t2, { size: 0.8 }); } }); }
        break;
      case 'NEWS_COLLECTED':
        if (go) { const rep = this.isActive('hantu') ? 'hantu' : 'corina'; this.send({ k: 'news' }, A(rep), C.lime, now, { size: 1.1, done: () => this.say(rep, `${(p.home ?? 0) + (p.away ?? 0)} știri · ${cut(String(p.match ?? ''), 18)}`, C.lime, performance.now()) }); }
        break;
      case 'AGENT_STARTED': {
        const id = e.agentId!; const a = this.agents.get(id); if (!a) break;
        const debating = (p.round ?? 0) > 0;
        a.status = debating ? 'DEBATING' : 'ANALYZING'; a.pulse = now; a.activity = 1;
        ((Array.isArray(p.fixtures) ? p.fixtures : []) as string[]).forEach((f, i) => { this.setFx(f, { state: debating ? 'DEBATE' : 'ANALYSIS' }); if (go) this.send(F(f), A(id), debating ? C.gold : C.cyan, now, { delay: i * 70, size: 0.7, dur: 750 }); });
        break;
      }
      case 'PREDICTION_SAVED': case 'POSITION_REVISED': {
        const id = e.agentId!; const a = this.agents.get(id); if (!a || !e.fixtureId) break;
        const bet = p.decision === 'BET_CANDIDATE';
        a.picks[e.fixtureId] = bet ? (p.marketKey ?? null) : null;
        const accent = AGENT_META[id]?.accent ?? C.cyan;
        if (e.type === 'POSITION_REVISED' && !p.changed) break;
        if (go) {
          const label = e.type === 'POSITION_REVISED' ? `↺ ${bet ? p.marketLabel ?? p.marketKey : 'NO BET'}` : bet ? `${p.marketLabel ?? p.marketKey}${p.odds ? ` @${Number(p.odds).toFixed(2)}` : ''}` : 'NO BET';
          this.send(A(id), F(e.fixtureId), bet ? accent : C.muted, now, { size: bet ? 1.1 : 0.7, done: () => { this.setFx(e.fixtureId!, { flash: performance.now(), flashColor: bet ? accent : C.muted }); } });
          this.say(id, label, bet ? accent : C.muted, now);
          if (bet) this.kick(A(id));
        }
        break;
      }
      case 'OBJECTION_RECORDED': {
        const id = e.agentId!; const fx = e.fixtureId; if (!fx) break;
        if (go) {
          const mine = this.agents.get(id)?.picks[fx];
          const others = [...this.agents.values()].filter((o) => o.id !== id && this.isActive(o.id) && fx in o.picks && o.picks[fx] !== mine).slice(0, 3);
          this.send(A(id), F(fx), C.gold, now, { size: 1.2, done: () => { const t = performance.now(); others.forEach((o, i) => this.send(F(fx), A(o.id), C.gold, t, { delay: i * 80, size: 0.8, dur: 700 })); this.burst(F(fx), C.gold, t, 0.8); } });
          this.say(id, `„${String(p.objection ?? 'obiecție')}”`, C.gold, now);
          this.kick(A(id)); this.confetti(this.refPos(A(id)), 8, now, { colors: [C.gold, '#fff3c4'], speed: 90, gravity: 0, life: 600 });
        }
        break;
      }
      case 'AGENT_COMPLETED': { const a = this.agents.get(e.agentId!); if (a) { a.status = 'DONE'; if (go) { const col = AGENT_META[a.id]?.accent ?? C.emerald; this.burst(A(a.id), col, now, 0.6, 600); this.confetti(this.refPos(A(a.id)), 10, now, { colors: [col, '#ffffff'], speed: 110, gravity: 120, life: 700 }); } } break; }
      case 'AGENT_FAILED': { const a = this.agents.get(e.agentId ?? ''); if (a) { a.status = 'FAILED'; if (go) { this.burst(A(a.id), C.rose, now, 0.8); this.say(a.id, 'indisponibil acum', C.rose, now); } } break; }
      case 'DEBATE_STARTED':
        for (const a of this.agents.values()) if (a.status !== 'FAILED') a.status = 'IDLE';
        for (const f of (Array.isArray(p.fixtures) ? p.fixtures : []) as string[]) { this.setFx(f, { state: 'DEBATE' }); if (go) this.burst(F(f), C.gold, now, 1.2); }
        if (go) this.shout('⚔ DEZBATERE', C.gold, now);
        break;
      case 'BRAIN_STARTED':
        if (go) { this.say(BRAIN, '🧠 aleg pronosticul ideal', C.gold, now); this.burst(A(BRAIN), C.gold, now, 1.6, 1200); this.shout('🧠 CREIERUL DECIDE', C.gold, now); this.kick(A(BRAIN)); }
        for (const f of this.fx.values()) if (['RESEARCH', 'ANALYSIS', 'DEBATE'].includes(f.state)) f.state = 'VOTING';
        break;
      case 'VOTE_SUBMITTED':
        if (e.fixtureId) { this.setFx(e.fixtureId, { state: 'VOTING' }); const a = this.agents.get(e.agentId ?? ''); if (a && a.status !== 'FAILED') a.status = 'DONE'; if (go && e.agentId) this.send(A(e.agentId), F(e.fixtureId), p.decision === 'BET_CANDIDATE' ? C.text : C.muted, now, { size: 0.5, dur: 650 }); }
        break;
      case 'BRAIN_DECISION':
        if (e.fixtureId && go) { this.send(A(BRAIN), F(e.fixtureId), C.gold, now, { size: 1.4, dur: 1000 }); this.say(BRAIN, p.choice ? `🧠 ${p.label}${p.odds ? ` @${Number(p.odds).toFixed(2)}` : ''}` : '🧠 resping lista', C.gold, now); }
        break;
      case 'CONSENSUS_CALCULATED':
        if (e.fixtureId) { this.setFx(e.fixtureId, { votes: `${p.votesFor ?? 0}/${p.total ?? '?'}` }); if (go) this.burst(F(e.fixtureId), p.outcome === 'QUALIFIED' ? C.emerald : C.muted, now, 1); }
        break;
      case 'SELECTION_ACCEPTED':
        if (e.fixtureId) {
          this.setFx(e.fixtureId, { state: 'ACCEPTED', odds: p.odds ?? null, market: p.marketLabel ?? null, acceptedIndex: this.acceptedCount++ });
          this.goalsTotal++;
          // The chosen match is a goal: a pass to a player who backed it, a shot, the net bulges.
          if (go) { this.burst(F(e.fixtureId), C.emerald, now, 1, 700); this.goalSequence(this.fx.get(e.fixtureId), now); }
        }
        break;
      case 'SELECTION_REJECTED':
        if (e.fixtureId) { this.setFx(e.fixtureId, { state: 'REJECTED', market: p.marketLabel ?? null }); if (go) { this.burst(F(e.fixtureId), C.rose, now, 1); this.missSequence(this.fx.get(e.fixtureId), now); } }
        break;
      case 'LEG_REVIEWED':
        if (e.fixtureId) {
          const col = p.verdict === 'SOLID' ? C.emerald : p.verdict === 'RISCANT' ? C.gold : C.rose;
          this.setFx(e.fixtureId, { state: 'ACCEPTED', odds: p.odds ?? null, market: p.label ?? null, acceptedIndex: this.acceptedCount++, verdict: p.verdict });
          if (p.verdict === 'SOLID') this.goalsTotal++;
          if (go) { this.burst(F(e.fixtureId), col, now, 1.4, 1100); if (p.verdict === 'SOLID') this.goalSequence(this.fx.get(e.fixtureId), now); for (const id of ((p.supporters ?? []) as string[]).slice(0, 6)) this.send(A(id), F(e.fixtureId), col, now, { size: 0.6, delay: Math.random() * 250 }); }
        }
        break;
      case 'REVIEW_ADVICE':
        this.reviewCounts = { solid: p.solid ?? 0, risky: p.risky ?? 0, weak: p.weak ?? 0 };
        if (go) { this.say(BRAIN, `🧠 ${String((p.advice ?? [])[0] ?? p.overall ?? 'verdict gata')}`, C.gold, now); this.burst(A(BRAIN), C.gold, now, 1.8, 1300); }
        break;
      case 'OPTIMIZATION_COMPLETED':
        for (const id of (p.legs ?? []) as string[]) this.setFx(id, { chosen: true });
        break;
      case 'TICKET_FINALIZED':
        this.final = { totalOdds: p.totalOdds ?? null, generation: p.generation, legs: p.legs ?? 0, target: p.target ?? this.target };
        for (const a of this.agents.values()) if (a.status !== 'FAILED') a.status = 'DONE';
        if (go) { this.burst({ k: 'tray' }, p.generation === 'COMPLETED' ? C.emerald : C.gold, now, 2.4, 1600); for (const id of Object.keys(this.formation)) this.send(A(id), { k: 'tray' }, AGENT_META[id]?.accent ?? C.cyan, now, { size: 0.6, delay: Math.random() * 300 });
          if (p.generation === 'COMPLETED') {
            // Final whistle move: the backlog is dropped, one last shot, and the celebration starts as the net bulges.
            this.ball.plan = [];
            this.goalSequence(undefined, now, true);
          } else {
            this.shout(p.generation === 'NO_BET' ? 'NO BET · PRUDENȚĂ' : 'BILET INCOMPLET', C.gold, now, true, 2000);
            if (!this.reducedMotion) this.ball.plan = [{ to: { k: 'center' }, kind: 'reset' }];
          }
        }
        break;
      case 'JOB_WAITING': case 'JOB_PAUSED':
        this.banner = { text: e.type === 'JOB_PAUSED' ? 'ÎN PAUZĂ' : 'AȘTEAPTĂ LIMITA FURNIZORULUI', color: C.gold };
        for (const a of this.agents.values()) if (a.status === 'ANALYZING' || a.status === 'DEBATING') a.status = 'WAITING';
        break;
      case 'JOB_RESUMED': this.banner = null; break;
    }
  }

  // ── Ball, goals and celebrations ───────────────────────────────────────
  /** Agent position on the pitch right now: formation spot + jogging offset (+ the jump while celebrating). */
  private agentPos(id: string): Vec {
    const base = this.L.agents[id]; if (!base) return this.L.src;
    const a = this.agents.get(id); if (!a) return base;
    let y = base.y + a.off.y;
    if (this.celebrate && !this.reducedMotion) {
      const ms = this.now - this.celebrate; const u = ms / 3400;
      if (u >= 0 && u < 1) y -= Math.abs(Math.sin(ms / 170 + a.phase)) * this.L.r * 0.6 * (1 - u);
    }
    return { x: base.x + a.off.x, y };
  }
  /** Attacking goal (right in wide mode, top on phones) or the brain's own goal. */
  private goalGeom(own = false) {
    const P = this.L.pitch; const wide = this.L.mode === 'wide';
    const hw = (wide ? P.h : P.w) * 0.46 * 0.22;
    if (wide) return own ? { wide, line: P.x + 6, c: P.y + P.h / 2, hw, depth: 13, dir: -1 } : { wide, line: P.x + P.w - 6, c: P.y + P.h / 2, hw, depth: 13, dir: 1 };
    return own ? { wide, line: P.y + P.h - 6, c: P.x + P.w / 2, hw, depth: 11, dir: 1 } : { wide, line: P.y + 6, c: P.x + P.w / 2, hw, depth: 11, dir: -1 };
  }
  /** off: −1…1 across the mouth (posts at ±1); depth: 0 on the goal line, 1 at the back of the net. */
  private goalPt(off: number, depth: number, own = false): Vec {
    const g = this.goalGeom(own); const a = g.line + g.dir * g.depth * depth; const b = g.c + off * g.hw;
    return g.wide ? { x: a, y: b } : { x: b, y: a };
  }
  /** Who shoots: one of the agents who backed this match (closest to goal), else any forward. */
  private strikerFor(fxId: string | null): string | null {
    const goal = this.goalPt(0, 0);
    const pool = Object.keys(this.formation).filter((id) => id !== BRAIN && id !== 'corina' && id !== 'porumboiu' && this.agents.get(id)?.status !== 'FAILED' && this.L.agents[id]);
    if (!pool.length) return null;
    const backers = fxId ? pool.filter((id) => this.agents.get(id)?.picks[fxId]) : [];
    const near = [...(backers.length ? backers : pool)].sort((a, b) => dist(this.L.agents[a], goal) - dist(this.L.agents[b], goal)).slice(0, 3);
    return near[Math.floor(Math.random() * near.length)];
  }
  private lastPlanned(): Ref | null { const b = this.ball; return b.plan.length ? b.plan[b.plan.length - 1].to : b.flight?.to ?? b.owner; }
  private goalSequence(fx: Fx | undefined, now: number, finale = false) {
    if (this.reducedMotion || !this.L) return;
    const b = this.ball;
    if (b.plan.length > 6) b.plan = b.plan.filter((s) => s.kind !== 'pass'); // long backlog: straight shots
    const striker = this.strikerFor(fx?.id ?? null); const last = this.lastPlanned();
    if (striker && !(last?.k === 'agent' && last.id === striker)) b.plan.push({ to: { k: 'agent', id: striker }, kind: 'pass' });
    const off = (Math.random() * 2 - 1) * 0.62;
    b.plan.push({ to: { k: 'goal', off, depth: 0.72 }, kind: 'shot', hold: finale ? 1e9 : 800, onArrive: (t) => (finale ? this.finale(t) : this.goalFx(fx, off, t)) });
    if (!finale) b.plan.push({ to: { k: 'center' }, kind: 'reset' });
    void now;
  }
  /** A rejected match: a shot that rattles the post and bounces out (only when the ball is free, never queued). */
  private missSequence(fx: Fx | undefined, t: number) {
    if (this.reducedMotion || !this.L) return;
    const b = this.ball;
    if (b.plan.length || (b.flight && b.flight.kind !== 'pass') || t < b.holdUntil) return;
    const striker = this.strikerFor(fx?.id ?? null);
    if (striker && !(b.owner?.k === 'agent' && b.owner.id === striker)) b.plan.push({ to: { k: 'agent', id: striker }, kind: 'pass' });
    const side = Math.random() < 0.5 ? -1 : 1;
    b.plan.push({ to: { k: 'post', side }, kind: 'shot', onArrive: (t2) => {
      this.shake = { t0: t2, amp: 2.4, dur: 280 / this.speed }; this.postHit = { t0: t2, side };
      this.burst({ k: 'post', side }, C.rose, t2, 0.8, 600);
      if (fx) this.shout(`BARĂ! ${code(fx.home)}–${code(fx.away)} · respins`, C.rose, t2, false, 1300);
      const g = this.goalGeom(); const p = this.goalPt(side, 0);
      const back = g.wide ? { x: p.x - g.dir * 70, y: p.y + side * 42 } : { x: p.x + side * 42, y: p.y - g.dir * 70 };
      b.plan.unshift({ to: { k: 'pt', x: back.x, y: back.y }, kind: 'bounce', hold: 350 });
    } });
    b.plan.push({ to: { k: 'center' }, kind: 'reset' });
  }
  private goalFx(fx: Fx | undefined, off: number, t: number) {
    const at = this.goalPt(off, 0.55);
    this.netHit = { t0: t, off };
    this.shake = { t0: t, amp: 5, dur: 420 / this.speed };
    this.flashFx = { t0: t, dur: 380 / this.speed, color: C.emerald, at };
    this.goalsShown = Math.min(this.goalsTotal, this.goalsShown + 1); this.goalPulse = t;
    this.burst({ k: 'goal', off, depth: 0.3 }, C.emerald, t, 2, 1000);
    this.confetti(at, 34, t, { speed: 240 });
    if (!fx) return;
    this.shout(`GOL! ${code(fx.home)}–${code(fx.away)}${fx.market ? ` · ${cut(fx.market, 18)}` : ''}`, C.emerald, t, true, 1500);
    this.send({ k: 'goal', off, depth: 0.5 }, { k: 'fx', id: fx.id }, C.emerald, t, { size: 1.3, dur: 800, done: () => { const t2 = performance.now(); this.burst({ k: 'fx', id: fx.id }, C.emerald, t2, 1.4, 900); this.setFx(fx.id, { flash: t2, flashColor: C.emerald }); } });
  }
  /** The ticket is done: last goal, the whole team jumps, fireworks, sweeping floodlights. */
  private finale(t: number) {
    const P = this.L.pitch;
    this.celebrate = t;
    this.netHit = { t0: t, off: 0 };
    this.shake = { t0: t, amp: 8, dur: 650 / this.speed };
    this.flashFx = { t0: t, dur: 650 / this.speed, color: C.gold, at: this.goalPt(0, 0.5) };
    this.goalPulse = t;
    this.shout('GOOOL! BILETUL E GATA', C.emerald, t, true, 2800);
    for (let i = 0; i < 5; i++) this.confetti({ x: P.x + P.w * (0.15 + Math.random() * 0.7), y: P.y + P.h * (0.2 + Math.random() * 0.5) }, 34, t, { delay: i * 260, speed: 220 });
    this.confetti(this.refPos({ k: 'tray' }), 40, t, { speed: 200 });
    this.fireworks(t, 7);
  }
  private fireworks(t: number, n: number) {
    if (this.reducedMotion) return;
    const P = this.L.pitch; const g = 520;
    for (let i = 0; i < n; i++) {
      const x = P.x + P.w * (0.1 + ((i + 0.2 + Math.random() * 0.6) / n) * 0.8);
      const y0 = P.y + P.h - 6; const apex = P.y + P.h * (0.12 + Math.random() * 0.3);
      const v0 = Math.sqrt(2 * g * (y0 - apex)); const tA = v0 / g;
      const delay = 150 + i * 240 + Math.random() * 200; const color = CONFETTI[i % CONFETTI.length];
      if (this.particles.length < MAX_PARTICLES) this.particles.push({ x, y: y0, vx: 0, vy: -v0, t0: t + delay, life: tA * 1000, color: '#fff3c4', size: 2.2, spin: 0, g, kind: 'rocket' });
      for (let k = 0; k < 40 && this.particles.length < MAX_PARTICLES; k++) {
        const a = (k / 40) * Math.PI * 2 + Math.random() * 0.2; const sp = 110 + Math.random() * 120;
        this.particles.push({ x, y: apex, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: t + delay + tA * 1000, life: 1000 + Math.random() * 600, color: k % 3 ? color : '#ffffff', size: 1.6 + Math.random() * 1.4, spin: 0, g: 110, kind: 'spark' });
      }
    }
  }
  /** Starts one ball movement (a pass, a shot, a rebound, or the restart from the centre spot). */
  private launch(step: Step, t: number) {
    const b = this.ball; const target = this.refPos(step.to);
    if (step.kind === 'reset') {
      b.pos = { ...target }; b.z = 0; b.flight = null; b.step = null; b.owner = step.to; b.pop = t; b.trail = [];
      b.holdUntil = t + (step.hold ?? 0) / this.speed; step.onArrive?.(t);
      this.burst(step.to, '#ffffff', t, 0.6, 500);
      return;
    }
    const from = { ...b.pos }; const d = dist(target, from); const kind = step.kind;
    const dur = (kind === 'shot' ? clamp(d / 950, 0.3, 0.6) : kind === 'bounce' ? 0.42 : clamp(d / 640, 0.28, 0.8)) * 1000 / this.speed;
    const h = kind === 'shot' ? 3 + d * 0.02 : kind === 'bounce' ? 12 : clamp(d * 0.16, 5, 44);
    b.flight = { from, z0: b.z, to: step.to, t0: t, dur, h, kind, curve: (Math.random() - 0.5) * (kind === 'shot' ? 0.32 : 0.22) };
    b.step = step;
    // The kicker strides into the ball; a puff of turf where it was struck.
    if (b.owner?.k === 'agent' && d > 0) { const a = this.agents.get(b.owner.id); if (a) { const s = (kind === 'shot' ? 9 : 5) * this.L.r; a.vel.x += ((target.x - from.x) / d) * s; a.vel.y += ((target.y - from.y) / d) * s; } }
    this.confetti(from, kind === 'shot' ? 10 : 5, t, { colors: ['#7fdc6c', '#c8f07a', '#eef5ec'], speed: kind === 'shot' ? 90 : 55, gravity: 30, life: 420 });
    if (kind === 'shot') this.burst({ k: 'pt', x: from.x, y: from.y }, '#ffffff', t, 0.6, 450);
    b.owner = null;
  }
  private updateBall(t: number, dt: number) {
    const b = this.ball; const P = this.L.pitch;
    if (b.pos.x === 0 && b.pos.y === 0) { b.pos = { x: P.x + P.w / 2, y: P.y + P.h / 2 }; b.owner = { k: 'center' }; }
    const prev = { x: b.pos.x, y: b.pos.y - b.z };
    if (b.flight) {
      const f = b.flight; const raw = clamp((t - f.t0) / f.dur, 0, 1);
      const u = 1 - Math.pow(1 - raw, f.kind === 'shot' ? 1.6 : f.kind === 'bounce' ? 2.2 : 2);
      const to = this.refPos(f.to); const dx = to.x - f.from.x, dy = to.y - f.from.y; const d = Math.hypot(dx, dy) || 1;
      const sway = Math.sin(raw * Math.PI) * d * f.curve; // the ball swerves
      b.pos = { x: f.from.x + dx * u - (dy / d) * sway, y: f.from.y + dy * u + (dx / d) * sway };
      b.z = f.z0 * (1 - raw) + 4 * f.h * raw * (1 - raw);
      if (raw >= 1) {
        b.flight = null; b.z = 0; b.pos = { ...to }; b.owner = f.to;
        const step = b.step; b.step = null;
        b.holdUntil = step?.hold ? t + step.hold / this.speed : 0;
        step?.onArrive?.(t);
      }
    } else if (b.plan.length && t >= b.holdUntil) this.launch(b.plan.shift()!, t);
    else if (b.owner) {
      let rest: Vec;
      if (b.owner.k === 'agent') {
        if (!this.L.agents[b.owner.id]) { b.owner = { k: 'center' }; rest = this.refPos(b.owner); }
        else {
          const p = this.agentPos(b.owner.id); const g = this.goalPt(0, 0); const d = dist(g, p) || 1; const ux = (g.x - p.x) / d, uy = (g.y - p.y) / d;
          const r = this.L.r; const drib = this.reducedMotion ? 0 : Math.sin(t / 170) * r * 0.16;
          rest = { x: p.x + ux * r * 0.95 - uy * drib, y: p.y + uy * r * 0.95 + ux * drib };
        }
      } else rest = this.refPos(b.owner);
      const k = 1 - Math.exp(-dt * 16);
      b.pos = { x: b.pos.x + (rest.x - b.pos.x) * k, y: b.pos.y + (rest.y - b.pos.y) * k };
    }
    const cur = { x: b.pos.x, y: b.pos.y - b.z };
    b.spin += Math.hypot(cur.x - prev.x, cur.y - prev.y) / 5;
    b.trail.unshift(cur); if (b.trail.length > 14) b.trail.pop();
    if (!b.plan.length && !b.flight && !b.step) this.goalsShown = this.goalsTotal;
  }
  /** Spring-driven jogging: each player drifts around his spot, runs to meet a pass, steps up with the ball. */
  private updateAgents(t: number, dt: number) {
    const r = this.L.r; const b = this.ball; const goal = this.goalPt(0, 0);
    const incoming = b.flight?.to.k === 'agent' ? b.flight.to.id : null;
    const holder = !b.flight && b.owner?.k === 'agent' ? b.owner.id : null;
    const K = 55, damp = Math.exp(-dt * 10);
    for (const a of this.agents.values()) {
      const base = this.L.agents[a.id]; if (!base) continue;
      if (this.reducedMotion) { a.off.x = a.off.y = a.vel.x = a.vel.y = 0; continue; }
      const working = a.status === 'ANALYZING' || a.status === 'DEBATING';
      const amp = r * (working ? 0.32 : 0.2);
      let tx = Math.sin(t / 1300 + a.phase) * amp + Math.sin(t / 3100 + a.phase * 2.3) * amp * 0.6;
      let ty = Math.cos(t / 1700 + a.phase * 1.7) * amp * 0.8;
      if (a.id === incoming) { const bx = b.pos.x - base.x, by = b.pos.y - base.y; const d = Math.hypot(bx, by) || 1; const run = Math.min(d * 0.35, r * 1.1); tx += (bx / d) * run; ty += (by / d) * run; }
      if (a.id === holder) { const gx = goal.x - base.x, gy = goal.y - base.y; const d = Math.hypot(gx, gy) || 1; tx += (gx / d) * r * 0.4; ty += (gy / d) * r * 0.4; }
      a.vel.x = (a.vel.x + (tx - a.off.x) * K * dt) * damp; a.vel.y = (a.vel.y + (ty - a.off.y) * K * dt) * damp;
      a.off.x += a.vel.x * dt; a.off.y += a.vel.y * dt;
    }
  }

  // ── Frame ──────────────────────────────────────────────────────────────
  private frame(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t; this.now = t;
    // Event queue: faster when it is long, so the map never falls far behind the real job.
    while (this.queue.length && t >= this.nextAt) {
      const item = this.queue.shift()!;
      this.apply(item.e, item.animate);
      this.hooks.onProgress?.(item.e.seq);
      const visual = ['AGENT_STARTED', 'PREDICTION_SAVED', 'OBJECTION_RECORDED', 'POSITION_REVISED', 'BRAIN_DECISION', 'SELECTION_ACCEPTED', 'SELECTION_REJECTED', 'BATCH_STARTED', 'NEWS_COLLECTED', 'RESEARCH_BRIEF', 'TICKET_FINALIZED', 'DEBATE_STARTED', 'BRAIN_STARTED', 'CONSENSUS_CALCULATED'].includes(item.e.type);
      const base = visual ? 340 : item.e.type === 'VOTE_SUBMITTED' ? 45 : 0;
      this.nextAt = t + base / this.speed / (1 + this.queue.length / 10);
      if (base > 0) break;
    }
    // Motion
    const k = 1 - Math.exp(-dt * 6);
    const queued = [...this.fx.values()].filter((f) => f.state === 'QUEUED').sort((a, b) => a.order - b.order);
    const active = [...this.fx.values()].filter((f) => ['RESEARCH', 'ANALYSIS', 'DEBATE', 'VOTING'].includes(f.state)).sort((a, b) => a.order - b.order);
    for (const f of this.fx.values()) {
      const tgt = this.fxTarget(f, queued, active);
      if (!f.seen) { f.seen = true; if (f.pos.x === 0 && f.pos.y === 0) f.pos = { ...tgt.p }; }
      f.pos.x += (tgt.p.x - f.pos.x) * k; f.pos.y += (tgt.p.y - f.pos.y) * k;
      f.alpha += (tgt.a - f.alpha) * k;
    }
    for (const a of this.agents.values()) a.activity = Math.max(0, a.activity - dt * 0.4);
    for (const d of this.dust) { d.x = (d.x + d.vx * dt + 1) % 1; d.y = (d.y + d.vy * dt + 1) % 1; }
    // Packets
    this.packets = this.packets.filter((p) => { if (t - p.t0 >= p.dur) { p.done?.(); return false; } return true; });
    this.bursts = this.bursts.filter((b) => t - b.t0 < b.dur);
    this.particles = this.particles.filter((q) => {
      if (t < q.t0) return true;
      if (t - q.t0 > q.life) return false;
      q.vy += q.g * dt; q.vx *= 1 - dt * 0.9;
      if (q.kind === 'spark') { q.vx *= 1 - dt * 1.4; q.vy *= 1 - dt * 1.4; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.spin += dt * 8; return true;
    });
    if (this.callout && t - this.callout.t0 > this.callout.dur) this.callout = null;
    if (this.L && this.L.pitch.w > 0 && this.L.pitch.h > 0) { this.updateAgents(t, dt); this.updateBall(t, dt); }
    this.draw(t);
    // FPS
    this.fpsAcc.frames++;
    if (t - this.fpsAcc.t0 > 500) { this.fpsAcc.value = Math.round((this.fpsAcc.frames * 1000) / (t - this.fpsAcc.t0)); this.fpsAcc.frames = 0; this.fpsAcc.t0 = t; }
  }

  private fxTarget(f: Fx, queued: Fx[], active: Fx[]): { p: Vec; a: number } {
    const L = this.L;
    if (f.state === 'QUEUED') {
      const i = queued.indexOf(f); const max = L.mode === 'wide' ? 8 : 6;
      if (L.mode === 'wide') return { p: { x: L.queue.x + 8 + (i % 2) * (L.queue.w / 2), y: L.queue.y + 32 + Math.floor(Math.min(i, max - 1) / 2) * 23 }, a: i < max ? 1 : 0 };
      return { p: { x: L.queue.x + 8 + Math.min(i, max - 1) * ((L.queue.w - 16 - 46) / (max - 1)), y: L.queue.y + 33 }, a: i < max ? 1 : 0 };
    }
    if (f.state === 'ACCEPTED') {
      const i = Math.max(0, f.acceptedIndex);
      if (L.mode === 'wide') { const row = 26; return { p: { x: L.tray.x + 10, y: L.tray.y + 40 + i * row }, a: L.tray.y + 40 + i * row < L.tray.y + L.tray.h - 10 ? 1 : 0 }; }
      const cw = (L.tray.w - 24) / 2; return { p: { x: L.tray.x + 8 + (i % 2) * (cw + 8), y: L.tray.y + 34 + Math.floor(i / 2) * 24 }, a: L.tray.y + 34 + Math.floor(i / 2) * 24 < L.tray.y + L.tray.h - 8 ? 1 : 0 };
    }
    if (f.state === 'REJECTED') return { p: L.discard, a: 0 };
    const i = Math.max(0, active.indexOf(f)); const n = Math.max(1, active.length);
    if (L.mode === 'wide') { const gap = Math.min(64, L.active.h / n); return { p: { x: L.active.x + 6, y: L.active.y + 28 + i * gap }, a: 1 }; }
    const colW = L.active.w / Math.min(n, 4); return { p: { x: L.active.x + (i % 4) * colW + 4, y: L.active.y + 44 }, a: i < 4 ? 1 : 0 };
  }

  private refPos(r: Ref): Vec {
    const L = this.L;
    switch (r.k) {
      case 'agent': return L.agents[r.id] ? this.agentPos(r.id) : L.src;
      case 'fx': { const f = this.fx.get(r.id); if (!f) return L.src; const w = this.fxWidth(f); return { x: f.pos.x + (L.mode === 'wide' ? 0 : w / 2) + (L.mode === 'wide' ? 4 : 0), y: f.pos.y }; }
      case 'src': return L.src;
      case 'news': return L.news;
      case 'tray': return { x: L.tray.x + L.tray.w / 2, y: L.tray.y + 16 };
      case 'goal': return this.goalPt(r.off, r.depth);
      case 'post': return this.goalPt(r.side, 0);
      case 'center': return { x: L.pitch.x + L.pitch.w / 2, y: L.pitch.y + L.pitch.h / 2 };
      case 'pt': return { x: r.x, y: r.y };
    }
  }

  private fxWidth(f: Fx) { const L = this.L; return f.state === 'QUEUED' ? (L.mode === 'wide' ? L.queue.w / 2 - 12 : 46) : L.mode === 'wide' ? L.active.w - 12 : L.active.w / 4 - 8; }

  // ── Drawing ────────────────────────────────────────────────────────────
  private draw(t: number) {
    const { ctx, L } = this;
    // ResizeObserver can report a hidden/unmounting container with zero width.
    // Its pitch has negative dimensions until layout returns; Canvas rejects
    // the resulting negative circle radius and would stop the animation loop.
    if (!L || L.pitch.w <= 0 || L.pitch.h <= 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Camera shake on goals: a short, decaying jolt of the whole stadium.
    if (this.shake) {
      const u = (t - this.shake.t0) / this.shake.dur;
      if (u >= 1 || this.reducedMotion) this.shake = null;
      else if (u >= 0) { const a = this.shake.amp * (1 - u) * (1 - u); ctx.fillStyle = '#0a1a12'; ctx.fillRect(0, 0, L.w, L.h); ctx.translate(Math.sin(t * 0.11) * a, Math.cos(t * 0.157) * a); }
    }
    if (!this.bg) this.bg = this.renderBackground();
    ctx.drawImage(this.bg, 0, 0, L.w, L.h);
    // Drifting dust + radar sweep from the centre circle
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of this.dust) { ctx.fillStyle = `rgba(238,245,236,${d.a * 0.3})`; ctx.fillRect(L.pitch.x + d.x * L.pitch.w, L.pitch.y + d.y * L.pitch.h, 1.5, 1.5); }
    if (!this.reducedMotion && 'createConicGradient' in ctx) {
      const cx = L.pitch.x + L.pitch.w / 2, cy = L.pitch.y + L.pitch.h / 2; const ang = (t / 4000) * Math.PI * 2;
      const g = (ctx as CanvasRenderingContext2D).createConicGradient(ang, cx, cy);
      g.addColorStop(0, 'rgba(255,236,190,0.08)'); g.addColorStop(0.08, 'rgba(255,236,190,0)'); g.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, Math.max(L.pitch.w, L.pitch.h) * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    this.drawLinks(t);
    this.drawGoal(t, true); this.drawGoal(t, false);
    this.drawPackets(t);
    this.drawArena(t);
    this.drawAgents(t);
    this.drawBursts(t);
    this.drawBall(t);
    this.drawParticles(t);
    this.drawFloodlights(t);
    this.drawHud(t);
    this.drawScoreboard(t);
    this.drawCallout(t);
    this.drawFlash(t);
  }

  private drawGoal(t: number, own: boolean) {
    const { ctx } = this; const g = this.goalGeom(own);
    const hit = !own && this.netHit && t - this.netHit.t0 < 1100 && t >= this.netHit.t0 ? this.netHit : null;
    const post = !own && this.postHit && t - this.postHit.t0 < 500 && t >= this.postHit.t0 ? this.postHit : null;
    // The net bulges where the ball went in, then ripples back.
    const bulge = (s: number) => { if (!hit || this.reducedMotion) return 0; const u = (t - hit.t0) / 1100; return Math.exp(-u * 4.5) * Math.cos(u * 26) * Math.exp(-((s - hit.off) ** 2) / 0.35) * 0.9; };
    const G = (s: number, d: number) => this.goalPt(s, d, own);
    const N = 10; const back: Vec[] = [];
    for (let i = 0; i <= N; i++) { const s = -1 + (2 * i) / N; back.push(G(s * 0.9, 1 + bulge(s))); }
    const f0 = G(-1, 0), f1 = G(1, 0);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(f0.x, f0.y); for (const q of back) ctx.lineTo(q.x, q.y); ctx.lineTo(f1.x, f1.y); ctx.closePath();
    ctx.fillStyle = hit ? `rgba(127,220,108,${0.08 + 0.22 * Math.max(0, 1 - (t - hit.t0) / 700)})` : 'rgba(238,245,236,0.06)'; ctx.fill();
    ctx.strokeStyle = 'rgba(238,245,236,0.28)'; ctx.lineWidth = 0.6;
    for (let i = 0; i <= N; i++) { const a = G(-1 + (2 * i) / N, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(back[i].x, back[i].y); ctx.stroke(); }
    for (const d of [0.35, 0.7]) { ctx.beginPath(); for (let i = 0; i <= N; i++) { const s = -1 + (2 * i) / N; const q = G(s * (1 - 0.1 * d), d * (1 + bulge(s))); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); } ctx.stroke(); }
    ctx.strokeStyle = 'rgba(238,245,236,0.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); back.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(f0.x, f0.y); ctx.lineTo(back[0].x, back[0].y); ctx.moveTo(f1.x, f1.y); ctx.lineTo(back[N].x, back[N].y); ctx.stroke();
    // Goal line between the posts, and the posts (the hit one shakes).
    ctx.strokeStyle = '#f4f8f2'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(f0.x, f0.y); ctx.lineTo(f1.x, f1.y); ctx.stroke();
    for (const s of [-1, 1]) {
      const q = G(s, 0); const w = post && post.side === s && !this.reducedMotion ? Math.sin((t - post.t0) / 18) * 2.4 * (1 - (t - post.t0) / 500) : 0;
      ctx.beginPath(); ctx.arc(q.x + (g.wide ? 0 : w), q.y + (g.wide ? w : 0), 2.8, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    if (hit) { const u = (t - hit.t0) / 1100; const s = this.glowSprite(C.emerald); const c = G(hit.off, 0.5); const z = 60 * (1 - u) + 20; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 * (1 - u); ctx.drawImage(s, c.x - z, c.y - z, z * 2, z * 2); }
    ctx.restore();
  }

  private ballImage() {
    if (this.ballSprite) return this.ballSprite;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(24, 22, 4, 32, 32, 32);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#eef2f4'); gr.addColorStop(1, '#a9b6be');
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
    this.ballSprite = c; return c;
  }

  private drawFloodlights(t: number) {
    if (!this.celebrate || this.reducedMotion) return;
    const ms = t - this.celebrate; const u = ms / 4200; if (u < 0 || u >= 1) return;
    const env = Math.sin(Math.min(1, u * 4) * Math.PI / 2) * (1 - u);
    const { ctx, L } = this; const P = L.pitch; const len = Math.hypot(P.w, P.h);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const side of [0, 1]) {
      const ox = side ? P.x + P.w : P.x, oy = P.y;
      const ang = (side ? Math.PI * 0.75 : Math.PI * 0.25) + Math.sin(ms / 650 + side * 2) * 0.35;
      const gr = ctx.createRadialGradient(ox, oy, 0, ox, oy, len);
      gr.addColorStop(0, `rgba(255,243,196,${0.24 * env})`); gr.addColorStop(1, 'rgba(255,243,196,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, len, ang - 0.13, ang + 0.13); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  private drawFlash(t: number) {
    const f = this.flashFx; if (!f || this.reducedMotion) return;
    const u = (t - f.t0) / f.dur; if (u >= 1) { this.flashFx = null; return; } if (u < 0) return;
    const { ctx, L } = this; const P = L.pitch;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2 * (1 - u) * (1 - u); ctx.fillStyle = '#fff7df'; ctx.fillRect(P.x, P.y, P.w, P.h);
    if (f.at) { const s = this.glowSprite(f.color); const z = Math.max(P.w, P.h) * 0.32 * (0.6 + u); ctx.globalAlpha = 0.5 * (1 - u); ctx.drawImage(s, f.at.x - z, f.at.y - z, z * 2, z * 2); }
    ctx.restore();
  }

  /** "⚽ GOLURI n": the selections accepted so far, counted as the ball crosses the line. */
  private drawScoreboard(t: number) {
    if (!this.goalsShown) return;
    const { ctx, L } = this; const P = L.pitch;
    const pulse = this.goalPulse && !this.reducedMotion ? Math.max(0, 1 - (t - this.goalPulse) / 700) : 0;
    const text = `⚽ GOLURI ${this.goalsShown}`;
    ctx.save(); ctx.font = `800 ${Math.round(11 + pulse * 3)}px ${this.font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const w = ctx.measureText(text).width + 18; const h = 20 + pulse * 4; const x = P.x + 12, y = P.y + P.h - 32 - pulse * 2;
    if (pulse) { const s = this.glowSprite(C.emerald); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * pulse; ctx.drawImage(s, x - 10, y - 20, w + 20, h + 40); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    roundRect(ctx, x, y, w, h, 6); ctx.fillStyle = 'rgba(8,22,15,0.9)'; ctx.fill(); ctx.strokeStyle = hexA(C.emerald, 0.5 + pulse * 0.5); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = C.emerald; ctx.fillText(text, x + 9, y + h / 2 + 0.5);
    ctx.restore();
  }

  private renderBackground() {
    const L = this.L;
    const c = document.createElement('canvas');
    c.width = Math.round(L.w * this.dpr); c.height = Math.round(L.h * this.dpr);
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const bg = g.createLinearGradient(0, 0, 0, L.h);
    bg.addColorStop(0, '#0e2419'); bg.addColorStop(1, '#0a1a12');
    g.fillStyle = bg; g.fillRect(0, 0, L.w, L.h);
    // Hex-ish dot grid
    g.fillStyle = 'rgba(238,245,236,0.05)';
    for (let y = 8; y < L.h; y += 18) for (let x = (Math.floor(y / 18) % 2) * 9 + 4; x < L.w; x += 18) g.fillRect(x, y, 1, 1);
    // Pitch
    const P = L.pitch; const wide = L.mode === 'wide';
    const field = g.createRadialGradient(P.x + P.w / 2, P.y + P.h / 2, 10, P.x + P.w / 2, P.y + P.h / 2, Math.max(P.w, P.h) * 0.7);
    field.addColorStop(0, 'rgba(36,96,58,0.6)'); field.addColorStop(1, 'rgba(14,44,28,0.6)');
    roundRect(g, P.x, P.y, P.w, P.h, 14); g.fillStyle = field; g.fill();
    // Mown stripes
    const stripes = 10;
    for (let i = 0; i < stripes; i += 2) { g.fillStyle = 'rgba(238,245,236,0.03)'; if (wide) g.fillRect(P.x + (i * P.w) / stripes, P.y, P.w / stripes, P.h); else g.fillRect(P.x, P.y + (i * P.h) / stripes, P.w, P.h / stripes); }
    g.strokeStyle = 'rgba(238,245,236,0.3)'; g.lineWidth = 1.4;
    roundRect(g, P.x + 6, P.y + 6, P.w - 12, P.h - 12, 10); g.stroke();
    const cx = P.x + P.w / 2, cy = P.y + P.h / 2; const cr = Math.min(P.w, P.h) * 0.13;
    g.beginPath(); if (wide) { g.moveTo(cx, P.y + 6); g.lineTo(cx, P.y + P.h - 6); } else { g.moveTo(P.x + 6, cy); g.lineTo(P.x + P.w - 6, cy); } g.stroke();
    g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, 2.5, 0, Math.PI * 2); g.fillStyle = 'rgba(238,245,236,0.55)'; g.fill();
    // Penalty boxes
    const boxD = (wide ? P.w : P.h) * 0.14, boxW = (wide ? P.h : P.w) * 0.46, sixD = boxD * 0.4, sixW = boxW * 0.45;
    const box = (atStart: boolean, d: number, wv: number) => {
      if (wide) { const x = atStart ? P.x + 6 : P.x + P.w - 6 - d; g.strokeRect(x, cy - wv / 2, d, wv); }
      else { const y = atStart ? P.y + 6 : P.y + P.h - 6 - d; g.strokeRect(cx - wv / 2, y, wv, d); }
    };
    box(true, boxD, boxW); box(false, boxD, boxW); box(true, sixD, sixW); box(false, sixD, sixW);
    // Arena panels
    g.lineWidth = 1;
    const panel = (r: { x: number; y: number; w: number; h: number }, title: string, color: string) => {
      roundRect(g, r.x, r.y, r.w, r.h, 10); g.fillStyle = 'rgba(14,36,25,0.82)'; g.fill(); g.strokeStyle = 'rgba(39,83,65,0.95)'; g.stroke();
      g.fillStyle = color; g.font = `600 11px ${this.font}`; g.textBaseline = 'top'; g.fillText(title, r.x + 10, r.y + 7);
    };
    panel(L.queue, 'Meciuri la intrare', 'rgba(163,188,173,0.95)');
    panel(L.active, 'În analiză și dezbatere', 'rgba(255,190,61,0.95)');
    panel(L.tray, 'Biletul', 'rgba(127,220,108,0.95)');
    return c;
  }

  private portrait(id: string, r: number) {
    const key = `${id}:${r}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const img = this.portraits.get(id);
    if (!img) return null;
    s = document.createElement('canvas');
    const size = Math.round(r * 2 * this.dpr);
    s.width = size; s.height = size;
    const g = s.getContext('2d')!;
    g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.clip();
    const ratio = Math.max(size / img.width, size / img.height);
    const w = img.width * ratio, h = img.height * ratio;
    g.drawImage(img, (size - w) / 2, (size - h) / 2 * 0.6, w, h);
    this.sprites.set(key, s);
    return s;
  }

  private glowSprite(color: string) {
    let s = this.glow.get(color);
    if (s) return s;
    s = document.createElement('canvas'); s.width = 64; s.height = 64;
    const g = s.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(0.25, hexA(color, 0.55)); gr.addColorStop(1, hexA(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.glow.set(color, s);
    return s;
  }

  private drawLinks(t: number) {
    const { ctx, L } = this;
    ctx.save();
    // Team network
    const ids = FORMATION.map((f) => f.id).filter((id) => this.isActive(id) && L.agents[id]);
    const pos = new Map(ids.map((id) => [id, this.agentPos(id)]));
    ctx.lineWidth = 1;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = pos.get(ids[i])!, b = pos.get(ids[j])!; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > Math.max(L.pitch.w, L.pitch.h) * 0.2) continue;
      const act = Math.max(this.agents.get(ids[i])!.activity, this.agents.get(ids[j])!.activity);
      ctx.strokeStyle = `rgba(238,245,236,${0.05 + act * 0.12})`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // Live work lines: analysing agents ↔ fixtures in play
    const inPlay = [...this.fx.values()].filter((f) => ['ANALYSIS', 'DEBATE', 'VOTING'].includes(f.state));
    ctx.setLineDash([4, 7]); ctx.lineDashOffset = -t / 40;
    for (const a of this.agents.values()) {
      if (!(a.status === 'ANALYZING' || a.status === 'DEBATING') || !this.isActive(a.id)) continue;
      const pa = pos.get(a.id); if (!pa) continue;
      for (const f of inPlay) { const pf = this.refPos({ k: 'fx', id: f.id }); ctx.strokeStyle = hexA(a.status === 'DEBATING' ? C.gold : AGENT_META[a.id]?.accent ?? C.cyan, 0.16); ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pf.x, pf.y); ctx.stroke(); }
    }
    ctx.restore();
  }

  private drawPackets(t: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.packets) {
      const raw = (t - p.t0) / p.dur; if (raw < 0) continue;
      const a = this.refPos(p.from), b = this.refPos(p.to);
      const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1;
      const cx = (a.x + b.x) / 2 - (dy / d) * d * p.bend * 0.35, cy = (a.y + b.y) / 2 + (dx / d) * d * p.bend * 0.35;
      const at = (u: number) => ({ x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * cx + u * u * b.x, y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * cy + u * u * b.y });
      const sprite = this.glowSprite(p.color);
      const head = ease(clamp(raw, 0, 1));
      for (let i = 7; i >= 0; i--) {
        const u = clamp(head - i * 0.025, 0, 1); const q = at(u); const s = (14 - i * 1.4) * p.size;
        ctx.globalAlpha = (1 - i / 8) * 0.8 * (raw > 0.92 ? (1 - raw) / 0.08 : 1);
        ctx.drawImage(sprite, q.x - s, q.y - s, s * 2, s * 2);
      }
    }
    ctx.restore();
  }

  private drawBursts(t: number) {
    const { ctx } = this;
    ctx.save();
    for (const b of this.bursts) {
      const u = (t - b.t0) / b.dur; if (u < 0) continue;
      const p = this.refPos(b.at);
      ctx.strokeStyle = hexA(b.color, (1 - u) * 0.8); ctx.lineWidth = 2 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, (8 + ease(u) * 34) * b.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  private drawAgents(t: number) {
    const { ctx, L } = this;
    const r = L.r;
    const squad = this.activeAgents !== null;
    for (const f of FORMATION) {
      if (!this.isActive(f.id)) continue; // unselected agents are not on the pitch at all
      const a = this.agents.get(f.id)!; const base = L.agents[f.id];
      if (!base) continue;
      const p = this.agentPos(f.id);
      const accent = AGENT_META[f.id]?.accent ?? C.cyan;
      ctx.save();
      // Shadow on the grass stays on the ground when the player jumps.
      ctx.beginPath(); ctx.ellipse(base.x + a.off.x + 2, base.y + a.off.y + r * 0.86, r * 0.82, r * 0.26, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
      // Entrance: each selected agent pops onto the pitch
      const sp = this.spawnAt.get(f.id); const enter = sp && !this.reducedMotion ? ease(clamp((t - sp) / 520, 0, 1)) : 1;
      if (enter < 1) { ctx.translate(p.x, p.y); ctx.scale(0.3 + enter * 0.7, 0.3 + enter * 0.7); ctx.translate(-p.x, -p.y); ctx.globalAlpha = enter; }
      // Every selected agent is highlighted (soft halo + rotating selection ring), not only the one talking
      if (squad && f.id !== 'corina') {
        const hs = this.glowSprite(accent); const hr = r * (1.9 + Math.sin(t / 700 + f.u * 9) * 0.12);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * enter; ctx.drawImage(hs, p.x - hr, p.y - hr, hr * 2, hr * 2);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = enter;
        ctx.save(); ctx.strokeStyle = hexA(accent, 0.7); ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t / 60;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 9, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      // Glow when working
      const working = a.status === 'ANALYZING' || a.status === 'DEBATING';
      if (working || a.activity > 0.05 || this.hover === f.id) {
        const s = this.glowSprite(a.status === 'DEBATING' ? C.gold : accent); const gs = r * (2.4 + (working ? Math.sin(t / 260) * 0.25 : 0) + a.activity * 0.6);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = working ? 0.5 : 0.3 + a.activity * 0.3; ctx.drawImage(s, p.x - gs, p.y - gs, gs * 2, gs * 2);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = enter;
      }
      // Disc + portrait
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = '#112b20'; ctx.fill();
      const img = this.portrait(f.id, r - 2);
      if (img) ctx.drawImage(img, p.x - (r - 2), p.y - (r - 2), (r - 2) * 2, (r - 2) * 2);
      else { ctx.fillStyle = accent; ctx.font = `700 ${Math.round(r * 0.7)}px ${this.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(NAME(f.id).slice(0, 2).toUpperCase(), p.x, p.y); }
      // Status ring
      ctx.lineWidth = 2.5;
      const ring = a.status === 'FAILED' ? C.rose : a.status === 'WAITING' ? C.muted : a.status === 'DEBATING' ? C.gold : accent;
      ctx.strokeStyle = hexA(ring, a.status === 'IDLE' ? 0.45 : 0.95);
      if (working) {
        const s = t / (a.status === 'DEBATING' ? 380 : 520);
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, s, s + Math.PI * 1.2); ctx.stroke();
        if (a.status === 'DEBATING') { ctx.beginPath(); ctx.arc(p.x, p.y, r + 7, -s * 1.3, -s * 1.3 + Math.PI * 0.8); ctx.stroke(); }
      } else {
        if (a.status === 'WAITING') ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
      if (a.status === 'DONE') { ctx.beginPath(); ctx.arc(p.x + r * 0.72, p.y - r * 0.72, 6, 0, Math.PI * 2); ctx.fillStyle = C.emerald; ctx.fill(); ctx.strokeStyle = '#04121a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p.x + r * 0.72 - 3, p.y - r * 0.72); ctx.lineTo(p.x + r * 0.72 - 1, p.y - r * 0.72 + 2.5); ctx.lineTo(p.x + r * 0.72 + 3, p.y - r * 0.72 - 2.5); ctx.stroke(); }
      if (f.id === BRAIN && L.mode === 'wide') { ctx.font = `700 9px ${this.font}`; ctx.fillStyle = C.gold; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('CREIER', p.x, p.y - r - 6); }
      // Name
      ctx.font = `600 ${r < 24 ? 10 : 11}px ${this.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const label = f.id === BRAIN && L.mode === 'tall' ? `🧠 ${NAME(f.id)}` : NAME(f.id);
      ctx.fillStyle = C.text; ctx.fillText(fit(ctx, label, L.mode === 'wide' ? 120 : 86), p.x, p.y + r + 6);
      ctx.restore();
    }
    // Speech bubbles on top of everything (newest few only, so the map stays readable on a phone)
    const maxBubbles = L.mode === 'wide' ? 8 : 4;
    const talking = new Set(FORMATION.map((f) => this.agents.get(f.id)!).filter((a) => a.bubble && this.isActive(a.id)).sort((a, b) => b.bubble!.t0 - a.bubble!.t0).slice(0, maxBubbles).map((a) => a.id));
    for (const f of FORMATION) {
      const a = this.agents.get(f.id)!; if (!a.bubble || !this.isActive(f.id)) continue;
      if (!talking.has(f.id)) { if ((t - a.bubble.t0) / 1000 > 3.6 / this.speed) a.bubble = null; continue; }
      const age = (t - a.bubble.t0) / 1000; const life = 3.6 / this.speed;
      if (age > life) { a.bubble = null; continue; }
      if (!L.agents[f.id]) continue; const p = this.agentPos(f.id);
      const alpha = Math.min(1, age * 6) * Math.min(1, (life - age) * 2);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.font = `600 11px ${this.font}`;
      const w = Math.min(ctx.measureText(a.bubble.text).width + 16, 220); const h = 22;
      const bx = clamp(p.x - w / 2, 4, L.w - w - 4); const by = p.y - r - 14 - h - (1 - Math.min(1, age * 5)) * 6 - (f.id === BRAIN ? 10 : 0);
      roundRect(ctx, bx, by, w, h, 6); ctx.fillStyle = 'rgba(8,22,15,0.93)'; ctx.fill(); ctx.strokeStyle = hexA(a.bubble.color, 0.9); ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(clamp(p.x, bx + 8, bx + w - 8) - 4, by + h); ctx.lineTo(clamp(p.x, bx + 8, bx + w - 8), by + h + 5); ctx.lineTo(clamp(p.x, bx + 8, bx + w - 8) + 4, by + h); ctx.fillStyle = hexA(a.bubble.color, 0.9); ctx.fill();
      ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(fit(ctx, a.bubble.text, w - 14), bx + 8, by + h / 2 + 0.5);
      ctx.restore();
    }
  }

  private drawBall(t: number) {
    if (this.reducedMotion || !this.L) return;
    const { ctx } = this; const b = this.ball;
    if (b.pos.x === 0 && b.pos.y === 0) return;
    const R = Math.max(5.2, this.L.r * 0.3) * (1 + b.z / 70);
    const sc = b.pop ? ease(clamp((t - b.pop) / 260, 0, 1)) : 1;
    // Shadow on the grass: further away and softer the higher the ball flies.
    ctx.save(); ctx.globalAlpha = (0.38 * sc) / (1 + b.z / 30); ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(b.pos.x + b.z * 0.35, b.pos.y + R * 0.55 + b.z * 0.12, R * (1 + b.z / 50), R * 0.42 * (1 + b.z / 50), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // Motion trail: a hot streak on shots, a soft one on passes.
    const fast = b.flight?.kind === 'shot';
    if (b.trail.length > 2) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 1; i < b.trail.length; i++) {
        const a = b.trail[i - 1], c = b.trail[i]; if (a.x === c.x && a.y === c.y) continue; const k = 1 - i / b.trail.length;
        ctx.strokeStyle = fast ? `rgba(255,226,150,${0.6 * k})` : `rgba(238,245,236,${0.2 * k})`; ctx.lineWidth = (fast ? 6 : 3) * k + 0.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      }
      if (fast) { const s = this.glowSprite('#ffe9b0'); ctx.globalAlpha = 0.7; ctx.drawImage(s, b.pos.x - 16, b.pos.y - b.z - 16, 32, 32); }
      ctx.restore();
    }
    // The ball: shaded sphere with rolling panels.
    ctx.save(); ctx.translate(b.pos.x, b.pos.y - b.z); ctx.scale(sc, sc);
    ctx.drawImage(this.ballImage(), -R, -R, R * 2, R * 2);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.97, 0, Math.PI * 2); ctx.clip();
    ctx.rotate(b.spin); ctx.fillStyle = 'rgba(22,30,40,0.88)';
    pentagon(ctx, 0, 0, R * 0.34, 0);
    for (let k = 0; k < 5; k++) { const a = k * 1.2566 - Math.PI / 2; pentagon(ctx, Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, R * 0.3, a); }
    ctx.restore();
  }

  private drawParticles(t: number) {
    if (!this.particles.length) return;
    const { ctx } = this;
    ctx.save();
    for (const q of this.particles) {
      if (t < q.t0 || q.kind) continue;
      const u = (t - q.t0) / q.life;
      ctx.globalAlpha = Math.max(0, 1 - u * u);
      ctx.fillStyle = q.color;
      const w = q.size * Math.abs(Math.cos(q.spin)) + 1;
      ctx.fillRect(q.x - w / 2, q.y - q.size / 2, w, q.size);
    }
    // Fireworks: rockets with a tail, glowing sparks.
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.particles) {
      if (t < q.t0 || !q.kind) continue;
      const u = (t - q.t0) / q.life;
      if (q.kind === 'rocket') {
        ctx.globalAlpha = 0.9; ctx.strokeStyle = q.color; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.05, q.y - q.vy * 0.05); ctx.stroke();
        const s = this.glowSprite('#fff3c4'); ctx.drawImage(s, q.x - 6, q.y - 6, 12, 12);
      } else {
        ctx.globalAlpha = Math.max(0, 1 - u) * (0.75 + Math.sin(t / 40 + q.size * 9) * 0.25);
        const s = this.glowSprite(q.color); const z = q.size * 2.6; ctx.drawImage(s, q.x - z, q.y - z, z * 2, z * 2);
      }
    }
    ctx.restore();
  }

  private drawCallout(t: number) {
    const c = this.callout; if (!c) return;
    const { ctx, L } = this; const P = L.pitch;
    const u = (t - c.t0) / c.dur;
    const pop = u < 0.15 ? ease(u / 0.15) : 1; const fade = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
    const size = (c.big ? Math.min(34, P.w / 14) : 14) * (0.6 + pop * 0.4);
    ctx.save();
    ctx.globalAlpha = fade; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(size)}px ${this.font}`;
    const x = P.x + P.w / 2, y = c.big ? P.y + P.h / 2 : P.y + 46;
    const w = ctx.measureText(c.text).width + 32, h = size + 18;
    if (c.big) { const s = this.glowSprite(c.color); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * fade; ctx.drawImage(s, x - w * 0.7, y - h * 1.6, w * 1.4, h * 3.2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade; }
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 8); ctx.fillStyle = 'rgba(8,22,15,0.86)'; ctx.fill(); ctx.strokeStyle = hexA(c.color, 0.9); ctx.lineWidth = c.big ? 2 : 1.2; ctx.stroke();
    ctx.fillStyle = c.color; ctx.fillText(c.text, x, y + 1);
    ctx.restore();
  }

  private drawArena(t: number) {
    const { ctx, L } = this;
    const queuedTotal = [...this.fx.values()].filter((f) => f.state === 'QUEUED').length;
    ctx.save();
    ctx.textBaseline = 'middle';
    for (const f of this.fx.values()) {
      if (f.alpha < 0.02) continue;
      ctx.globalAlpha = f.alpha;
      const w = this.fxWidth(f); const x = f.pos.x, y = f.pos.y;
      const flash = f.flash ? Math.max(0, 1 - (t - f.flash) / 700) : 0;
      if (f.state === 'QUEUED') {
        const h = 18; roundRect(ctx, x, y - h / 2, w, h, 6); ctx.fillStyle = 'rgba(22,53,40,0.95)'; ctx.fill(); ctx.strokeStyle = 'rgba(163,188,173,0.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = C.muted; ctx.font = `600 9.5px ${this.font}`; ctx.textAlign = 'center'; ctx.fillText(L.mode === 'wide' ? fit(ctx, `${teamShort(f.home)} – ${teamShort(f.away)}`, w - 8) : `${code(f.home)}·${code(f.away)}`, x + w / 2, y + 0.5);
        continue;
      }
      if (f.state === 'ACCEPTED' || f.state === 'REJECTED') {
        if (f.state === 'REJECTED' && f.alpha < 0.3) continue;
        const tw = L.mode === 'wide' ? L.tray.w - 20 : (L.tray.w - 24) / 2; const h = 20;
        const dim = this.final?.generation === 'COMPLETED' && f.state === 'ACCEPTED' && !f.chosen; if (dim) ctx.globalAlpha = f.alpha * 0.35;
        const vc = f.verdict === 'SOLID' ? C.emerald : f.verdict === 'RISCANT' ? C.gold : f.verdict ? C.rose : f.state === 'ACCEPTED' ? C.emerald : C.rose;
        roundRect(ctx, x, y - h / 2, tw, h, 8); ctx.fillStyle = hexA(vc, 0.12); ctx.fill();
        ctx.strokeStyle = hexA(vc, 0.55); ctx.lineWidth = 1; ctx.stroke();
        ctx.font = `600 10px ${this.font}`; ctx.textAlign = 'left'; ctx.fillStyle = C.text;
        const oddsTxt = f.odds ? Number(f.odds).toFixed(2) : '';
        ctx.fillText(fit(ctx, L.mode === 'wide' ? `${teamShort(f.home)} – ${teamShort(f.away)} · ${f.market ?? ''}` : `${code(f.home)}–${code(f.away)} · ${f.market ?? ''}`, tw - 44), x + 7, y + 0.5);
        ctx.textAlign = 'right'; ctx.fillStyle = vc; ctx.font = `700 10.5px ${this.font}`; ctx.fillText(oddsTxt, x + tw - 7, y + 0.5);
        continue;
      }
      // Active card
      const h = 44;
      const col = f.state === 'DEBATE' ? C.gold : f.state === 'VOTING' ? C.violet : C.cyan;
      roundRect(ctx, x, y - h / 2, w, h, 8); ctx.fillStyle = 'rgba(17,43,32,0.97)'; ctx.fill();
      ctx.strokeStyle = hexA(flash > 0 ? f.flashColor : col, 0.5 + flash * 0.5 + (f.state === 'DEBATE' ? Math.sin(t / 200) * 0.15 : 0)); ctx.lineWidth = 1.2 + flash * 1.5; ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = `700 ${L.mode === 'wide' ? 11 : 10}px ${this.font}`;
      if (L.mode === 'wide') ctx.fillText(fit(ctx, `${teamShort(f.home)} – ${teamShort(f.away)}`, w - 16), x + 8, y - 8);
      else { ctx.fillText(fit(ctx, teamShort(f.home), w - 10), x + 6, y - 11); ctx.fillText(fit(ctx, teamShort(f.away), w - 10), x + 6, y + 1); }
      ctx.font = `700 9px ${this.font}`; ctx.fillStyle = col;
      const label = f.state === 'RESEARCH' ? 'Date și istoric' : f.state === 'ANALYSIS' ? 'Analiză' : f.state === 'DEBATE' ? 'Dezbatere' : 'Vot la creier';
      if (L.mode === 'wide') ctx.fillText(`${label}${f.votes ? ` · ${f.votes}` : ''}`, x + 8, y + 9);
      else ctx.fillText(fit(ctx, `${label}${f.votes ? ` ${f.votes}` : ''}`, w - 10), x + 6, y + 13);
      if (f.state === 'RESEARCH' || f.state === 'ANALYSIS') { const s = (t / 900) % 1; ctx.fillStyle = hexA(col, 0.5); ctx.fillRect(x + 8, y + h / 2 - 3, (w - 16) * s, 1.5); }
    }
    ctx.globalAlpha = 1;
    // Queue overflow + tray header
    const max = L.mode === 'wide' ? 8 : 6;
    if (queuedTotal > max) { ctx.fillStyle = C.muted; ctx.font = `600 10px ${this.font}`; ctx.textAlign = 'right'; ctx.fillText(`+${queuedTotal - max}`, L.queue.x + L.queue.w - 10, L.queue.y + 12); }
    else if (!this.fx.size) { ctx.fillStyle = C.muted; ctx.font = `500 10px ${this.font}`; ctx.textAlign = 'left'; ctx.fillText('se caută meciurile…', L.queue.x + 10, L.queue.y + L.queue.h / 2 + 4); }
    const accepted = [...this.fx.values()].filter((f) => f.state === 'ACCEPTED' && f.odds);
    const total = accepted.reduce((m, f) => m * Number(f.odds), 1);
    ctx.textAlign = 'right'; ctx.font = `700 11px ${this.font}`;
    ctx.fillStyle = this.final ? (this.final.generation === 'COMPLETED' ? C.emerald : C.gold) : C.text;
    const head = this.reviewCounts ? `✓${this.reviewCounts.solid} ⚠${this.reviewCounts.risky} ✗${this.reviewCounts.weak} · ${total.toFixed(2)}` : this.final ? (this.final.generation === 'COMPLETED' ? `COTĂ ${Number(this.final.totalOdds).toFixed(2)} ✓` : this.final.generation === 'NO_BET' ? 'NO BET' : 'INCOMPLET') : accepted.length ? `${accepted.length} sel. · ${total.toFixed(2)}${this.target ? ` / ${this.target}` : ''}` : this.target ? `țintă ${this.target}` : '';
    ctx.fillText(head, L.tray.x + L.tray.w - 10, L.tray.y + 13);
    ctx.restore();
  }

  private drawHud(t: number) {
    const { ctx, L } = this;
    ctx.save();
    ctx.font = `600 9px ${this.font}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    // Data sources
    for (const [p, label, col] of [[L.src, 'Date, cote, istoric', C.cyan], [L.news, 'Presă', C.lime]] as const) {
      const s = this.glowSprite(col); ctx.globalAlpha = 0.5 + Math.sin(t / 500) * 0.15; ctx.drawImage(s, p.x - 14, p.y - 14, 28, 28); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = hexA(col, 0.9); ctx.fillText(label, p.x + 9, p.y - 4);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(163,188,173,0.5)';
    ctx.fillText(`${this.fpsAcc.value || '—'} FPS`, L.pitch.x + L.pitch.w - 10, L.pitch.y + L.pitch.h - 16);
    if (this.banner) {
      ctx.font = `700 11px ${this.font}`; ctx.textAlign = 'center';
      const w = ctx.measureText(this.banner.text).width + 24; const x = L.pitch.x + L.pitch.w / 2 - w / 2, y = L.pitch.y + 12;
      roundRect(ctx, x, y, w, 22, 6); ctx.fillStyle = 'rgba(8,22,15,0.92)'; ctx.fill(); ctx.strokeStyle = this.banner.color; ctx.stroke();
      ctx.fillStyle = this.banner.color; ctx.textBaseline = 'middle'; ctx.fillText(this.banner.text, x + w / 2, y + 11.5);
    }
    ctx.restore();
  }
}

// ── Layout ───────────────────────────────────────────────────────────────
function layout(w: number, h: number, form: Record<string, Spot>): Layout {
  const wide = w / h > 1.15;
  if (wide) {
    const arenaW = clamp(w * 0.27, 190, 300);
    const pitch = { x: 12, y: 12, w: w - arenaW - 36, h: h - 24 };
    const ax = pitch.x + pitch.w + 12;
    const queue = { x: ax, y: 12, w: arenaW, h: clamp(h * 0.24, 122, 136) };
    const tray = { x: ax, y: h - 12 - clamp(h * 0.34, 120, 230), w: arenaW, h: clamp(h * 0.34, 120, 230) };
    const active = { x: ax, y: queue.y + queue.h + 10, w: arenaW, h: tray.y - (queue.y + queue.h + 10) - 10 };
    const r = clamp(Math.min(pitch.w / 30, pitch.h / 13), 13, 24) * (Object.keys(form).length > 24 ? 0.82 : 1);
    const agents: Record<string, Vec> = {};
    for (const [id, f] of Object.entries(form)) agents[id] = { x: pitch.x + 30 + f.u * (pitch.w - 60), y: pitch.y + 75 + f.v * (pitch.h - 160) };
    return { mode: 'wide', w, h, r, pitch, agents, src: { x: pitch.x + pitch.w - 120, y: pitch.y + 18 }, news: { x: pitch.x + 22, y: pitch.y + 18 }, discard: { x: ax + arenaW + 40, y: active.y + active.h / 2 }, queue, active, tray };
  }
  const queue = { x: 10, y: 10, w: w - 20, h: 48 };
  const active = { x: 10, y: queue.y + queue.h + 8, w: w - 20, h: 74 };
  const trayH = clamp(h * 0.16, 96, 132);
  const tray = { x: 10, y: h - 10 - trayH, w: w - 20, h: trayH };
  const pitch = { x: 10, y: active.y + active.h + 10, w: w - 20, h: tray.y - (active.y + active.h + 10) - 10 };
  const r = clamp(Math.min(pitch.w / 13, pitch.h / 30), 12, 20) * (Object.keys(form).length > 24 ? 0.85 : 1);
  const agents: Record<string, Vec> = {};
  for (const [id, f] of Object.entries(form)) agents[id] = { x: pitch.x + 54 + f.v * (pitch.w - 108), y: pitch.y + pitch.h - 30 - f.u * (pitch.h - 76) };
  return { mode: 'tall', w, h, r, pitch, agents, src: { x: pitch.x + 14, y: pitch.y + 14 }, news: { x: pitch.x + pitch.w - 54, y: pitch.y + 14 }, discard: { x: w / 2, y: -40 }, queue, active, tray };
}

// ── Helpers ──────────────────────────────────────────────────────────────
function pentagon(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  g.beginPath();
  for (let i = 0; i < 5; i++) { const a = rot + (i * Math.PI * 2) / 5; if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath(); g.fill();
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  if (!(w > 0 && h > 0)) return;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2)); g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + h, rr); g.arcTo(x + w, y + h, x, y + h, rr); g.arcTo(x, y + h, x, y, rr); g.arcTo(x, y, x + w, y, rr); g.closePath();
}
function hexA(hex: string, a: number) {
  const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
}
function fit(g: CanvasRenderingContext2D, s: string, max: number) {
  if (g.measureText(s).width <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (g.measureText(s.slice(0, mid) + '…').width <= max) lo = mid; else hi = mid - 1; }
  return s.slice(0, lo) + '…';
}
