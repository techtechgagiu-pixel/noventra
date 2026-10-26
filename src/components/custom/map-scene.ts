/**
 * Real-time "tactical map" of the agents, drawn on a canvas at the display's refresh rate (60 fps target).
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
type AgentNode = { id: string; status: AgentStatus; pulse: number; bubble: { text: string; color: string; t0: number } | null; picks: Record<string, string | null>; activity: number };
type Ref = { k: 'agent'; id: string } | { k: 'fx'; id: string } | { k: 'src' } | { k: 'news' } | { k: 'tray' };
type Packet = { from: Ref; to: Ref; t0: number; dur: number; color: string; size: number; bend: number; done?: () => void };
type Burst = { at: Ref; t0: number; dur: number; color: string; r: number };
type Particle = { x: number; y: number; vx: number; vy: number; t0: number; life: number; color: string; size: number; spin: number; g: number };
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
const CONFETTI = ['#34d399', '#e8c26a', '#5ee7f7', '#fb7185', '#a78bfa', '#eef2fb'];
const C = { cyan: '#5ee7f7', emerald: '#34d399', gold: '#e8c26a', rose: '#fb7185', violet: '#a78bfa', muted: '#94a3c4', text: '#eef2fb', lime: '#84cc16', line: '#22325a' };
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
  private ball: { pos: Vec; to: Ref | null; trail: Vec[] } = { pos: { x: 0, y: 0 }, to: null, trail: [] };
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
    for (const f of FORMATION) this.agents.set(f.id, { id: f.id, status: 'IDLE', pulse: 0, bubble: null, picks: {}, activity: 0 });
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
    this.fx.clear(); this.packets = []; this.bursts = []; this.particles = []; this.callout = null; this.ball = { pos: { x: 0, y: 0 }, to: null, trail: [] }; this.setSquad(null, 0); this.queue = []; this.final = null; this.banner = null; this.acceptedCount = 0; this.stage = 'QUEUED'; this.lastSeq = 0;
    for (const a of this.agents.values()) Object.assign(a, { status: 'IDLE', pulse: 0, bubble: null, picks: {}, activity: 0 });
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.L = layout(cssW, cssH, this.formation);
    this.bg = null; this.sprites.clear(); this.glow.clear();
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
    for (const [id, p] of Object.entries(this.L.agents)) if (Math.hypot(p.x - x, p.y - y) < this.L.r * 1.25) hit = id;
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
    for (let i = 0; i < n && this.particles.length < 600; i++) {
      const a = Math.random() * Math.PI * 2; const sp = (opts.speed ?? 160) * (0.35 + Math.random() * 0.8);
      this.particles.push({ x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.speed ?? 160) * 0.35, t0: now + (opts.delay ?? 0), life: (opts.life ?? 1400) * (0.7 + Math.random() * 0.5), color: colors[i % colors.length], size: 2 + Math.random() * 3, spin: Math.random() * 6, g: opts.gravity ?? 260 });
    }
  }
  private shout(text: string, color: string, now: number, big = false, dur = 1500) { if (!this.reducedMotion) this.callout = { text, color, t0: now, dur: dur / this.speed, big }; }
  private kick(to: Ref) { if (!this.reducedMotion) this.ball.to = to; }
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
        if (go) this.shout(`${Object.keys(this.formation).length} agenți intră pe teren`, C.cyan, now, false, 1800);
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
        if (e.fixtureId) { this.setFx(e.fixtureId, { state: 'ACCEPTED', odds: p.odds ?? null, market: p.marketLabel ?? null, acceptedIndex: this.acceptedCount++ }); if (go) { this.burst(F(e.fixtureId), C.emerald, now, 1.5, 1100); this.confetti(this.refPos(F(e.fixtureId)), 28, now); this.kick(F(e.fixtureId)); } }
        break;
      case 'SELECTION_REJECTED':
        if (e.fixtureId) { this.setFx(e.fixtureId, { state: 'REJECTED', market: p.marketLabel ?? null }); if (go) this.burst(F(e.fixtureId), C.rose, now, 1); }
        break;
      case 'LEG_REVIEWED':
        if (e.fixtureId) {
          const col = p.verdict === 'SOLID' ? C.emerald : p.verdict === 'RISCANT' ? C.gold : C.rose;
          this.setFx(e.fixtureId, { state: 'ACCEPTED', odds: p.odds ?? null, market: p.label ?? null, acceptedIndex: this.acceptedCount++, verdict: p.verdict });
          if (go) { this.burst(F(e.fixtureId), col, now, 1.4, 1100); if (p.verdict === 'SOLID') this.confetti(this.refPos(F(e.fixtureId)), 22, now); for (const id of ((p.supporters ?? []) as string[]).slice(0, 6)) this.send(A(id), F(e.fixtureId), col, now, { size: 0.6, delay: Math.random() * 250 }); }
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
          this.kick({ k: 'tray' });
          if (p.generation === 'COMPLETED') {
            this.shout('GOOOL! BILETUL E GATA', C.emerald, now, true, 2600);
            const P = this.L.pitch;
            for (let i = 0; i < 6; i++) this.confetti({ x: P.x + P.w * (0.15 + Math.random() * 0.7), y: P.y + P.h * (0.2 + Math.random() * 0.5) }, 40, now, { delay: i * 260, speed: 220 });
            this.confetti(this.refPos({ k: 'tray' }), 50, now, { speed: 200 });
          } else this.shout(p.generation === 'NO_BET' ? 'NO BET · PRUDENȚĂ' : 'BILET INCOMPLET', C.gold, now, true, 2000);
        }
        break;
      case 'JOB_WAITING': case 'JOB_PAUSED':
        this.banner = { text: e.type === 'JOB_PAUSED' ? 'ÎN PAUZĂ' : 'AȘTEAPTĂ LIMITA FURNIZORULUI', color: C.gold };
        for (const a of this.agents.values()) if (a.status === 'ANALYZING' || a.status === 'DEBATING') a.status = 'WAITING';
        break;
      case 'JOB_RESUMED': this.banner = null; break;
    }
  }

  // ── Frame ──────────────────────────────────────────────────────────────
  private frame(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
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
      q.vy += q.g * dt; q.vx *= 1 - dt * 0.9; q.x += q.vx * dt; q.y += q.vy * dt; q.spin += dt * 8; return true;
    });
    if (this.callout && t - this.callout.t0 > this.callout.dur) this.callout = null;
    if (this.L) {
      const b = this.ball; const P = this.L.pitch;
      if (b.pos.x === 0 && b.pos.y === 0) b.pos = { x: P.x + P.w / 2, y: P.y + P.h / 2 };
      const tgt = b.to ? this.refPos(b.to) : { x: P.x + P.w / 2, y: P.y + P.h / 2 };
      const kb = 1 - Math.exp(-dt * 4 * this.speed);
      b.pos = { x: b.pos.x + (tgt.x - b.pos.x) * kb, y: b.pos.y + (tgt.y - b.pos.y) * kb };
      b.trail.unshift({ ...b.pos }); if (b.trail.length > 12) b.trail.pop();
    }
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
      case 'agent': return L.agents[r.id] ?? L.src;
      case 'fx': { const f = this.fx.get(r.id); if (!f) return L.src; const w = this.fxWidth(f); return { x: f.pos.x + (L.mode === 'wide' ? 0 : w / 2) + (L.mode === 'wide' ? 4 : 0), y: f.pos.y }; }
      case 'src': return L.src;
      case 'news': return L.news;
      case 'tray': return { x: L.tray.x + L.tray.w / 2, y: L.tray.y + 16 };
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
    if (!this.bg) this.bg = this.renderBackground();
    ctx.drawImage(this.bg, 0, 0, L.w, L.h);
    // Drifting dust + radar sweep from the centre circle
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of this.dust) { ctx.fillStyle = `rgba(94,231,247,${d.a * 0.35})`; ctx.fillRect(L.pitch.x + d.x * L.pitch.w, L.pitch.y + d.y * L.pitch.h, 1.5, 1.5); }
    if (!this.reducedMotion && 'createConicGradient' in ctx) {
      const cx = L.pitch.x + L.pitch.w / 2, cy = L.pitch.y + L.pitch.h / 2; const ang = (t / 4000) * Math.PI * 2;
      const g = (ctx as CanvasRenderingContext2D).createConicGradient(ang, cx, cy);
      g.addColorStop(0, 'rgba(94,231,247,0.10)'); g.addColorStop(0.08, 'rgba(94,231,247,0)'); g.addColorStop(1, 'rgba(94,231,247,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, Math.max(L.pitch.w, L.pitch.h) * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    this.drawLinks(t);
    this.drawPackets(t);
    this.drawArena(t);
    this.drawAgents(t);
    this.drawBursts(t);
    this.drawBall();
    this.drawParticles(t);
    this.drawHud(t);
    this.drawCallout(t);
  }

  private renderBackground() {
    const L = this.L;
    const c = document.createElement('canvas');
    c.width = Math.round(L.w * this.dpr); c.height = Math.round(L.h * this.dpr);
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    const bg = g.createLinearGradient(0, 0, 0, L.h);
    bg.addColorStop(0, '#071026'); bg.addColorStop(1, '#050a18');
    g.fillStyle = bg; g.fillRect(0, 0, L.w, L.h);
    // Hex-ish dot grid
    g.fillStyle = 'rgba(94,231,247,0.06)';
    for (let y = 8; y < L.h; y += 18) for (let x = (Math.floor(y / 18) % 2) * 9 + 4; x < L.w; x += 18) g.fillRect(x, y, 1, 1);
    // Pitch
    const P = L.pitch; const wide = L.mode === 'wide';
    const field = g.createRadialGradient(P.x + P.w / 2, P.y + P.h / 2, 10, P.x + P.w / 2, P.y + P.h / 2, Math.max(P.w, P.h) * 0.7);
    field.addColorStop(0, 'rgba(20,60,80,0.55)'); field.addColorStop(1, 'rgba(8,22,40,0.55)');
    roundRect(g, P.x, P.y, P.w, P.h, 14); g.fillStyle = field; g.fill();
    // Mown stripes
    const stripes = 10;
    for (let i = 0; i < stripes; i += 2) { g.fillStyle = 'rgba(94,231,247,0.025)'; if (wide) g.fillRect(P.x + (i * P.w) / stripes, P.y, P.w / stripes, P.h); else g.fillRect(P.x, P.y + (i * P.h) / stripes, P.w, P.h / stripes); }
    g.strokeStyle = 'rgba(94,231,247,0.22)'; g.lineWidth = 1.2;
    roundRect(g, P.x + 6, P.y + 6, P.w - 12, P.h - 12, 10); g.stroke();
    const cx = P.x + P.w / 2, cy = P.y + P.h / 2; const cr = Math.min(P.w, P.h) * 0.13;
    g.beginPath(); if (wide) { g.moveTo(cx, P.y + 6); g.lineTo(cx, P.y + P.h - 6); } else { g.moveTo(P.x + 6, cy); g.lineTo(P.x + P.w - 6, cy); } g.stroke();
    g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, 2.5, 0, Math.PI * 2); g.fillStyle = 'rgba(94,231,247,0.4)'; g.fill();
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
      roundRect(g, r.x, r.y, r.w, r.h, 12); g.fillStyle = 'rgba(15,26,53,0.72)'; g.fill(); g.strokeStyle = 'rgba(34,50,90,0.9)'; g.stroke();
      g.fillStyle = color; g.font = `700 10px ${this.font}`; g.textBaseline = 'top'; g.fillText(title, r.x + 10, r.y + 7);
    };
    panel(L.queue, 'INTRARE · MECIURI', 'rgba(148,163,196,0.9)');
    panel(L.active, 'ÎN ANALIZĂ / DEZBATERE', 'rgba(94,231,247,0.9)');
    panel(L.tray, 'BILETUL', 'rgba(52,211,153,0.95)');
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
    const ids = FORMATION.map((f) => f.id).filter((id) => this.isActive(id));
    ctx.lineWidth = 1;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = L.agents[ids[i]], b = L.agents[ids[j]]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > Math.max(L.pitch.w, L.pitch.h) * 0.2) continue;
      const act = Math.max(this.agents.get(ids[i])!.activity, this.agents.get(ids[j])!.activity);
      ctx.strokeStyle = `rgba(94,231,247,${0.05 + act * 0.12})`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // Live work lines: analysing agents ↔ fixtures in play
    const inPlay = [...this.fx.values()].filter((f) => ['ANALYSIS', 'DEBATE', 'VOTING'].includes(f.state));
    ctx.setLineDash([4, 7]); ctx.lineDashOffset = -t / 40;
    for (const a of this.agents.values()) {
      if (!(a.status === 'ANALYZING' || a.status === 'DEBATING') || !this.isActive(a.id)) continue;
      const pa = L.agents[a.id];
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
      const a = this.agents.get(f.id)!; const p = L.agents[f.id];
      if (!p) continue;
      const accent = AGENT_META[f.id]?.accent ?? C.cyan;
      ctx.save();
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
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = '#0f1a35'; ctx.fill();
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
      const p = L.agents[f.id]; if (!p) continue;
      const alpha = Math.min(1, age * 6) * Math.min(1, (life - age) * 2);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.font = `600 11px ${this.font}`;
      const w = Math.min(ctx.measureText(a.bubble.text).width + 16, 220); const h = 22;
      const bx = clamp(p.x - w / 2, 4, L.w - w - 4); const by = p.y - r - 14 - h - (1 - Math.min(1, age * 5)) * 6 - (f.id === BRAIN ? 10 : 0);
      roundRect(ctx, bx, by, w, h, 8); ctx.fillStyle = 'rgba(6,11,24,0.92)'; ctx.fill(); ctx.strokeStyle = hexA(a.bubble.color, 0.9); ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(clamp(p.x, bx + 8, bx + w - 8) - 4, by + h); ctx.lineTo(clamp(p.x, bx + 8, bx + w - 8), by + h + 5); ctx.lineTo(clamp(p.x, bx + 8, bx + w - 8) + 4, by + h); ctx.fillStyle = hexA(a.bubble.color, 0.9); ctx.fill();
      ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(fit(ctx, a.bubble.text, w - 14), bx + 8, by + h / 2 + 0.5);
      ctx.restore();
    }
  }

  private drawBall() {
    if (this.reducedMotion || !this.ball.to) return;
    const { ctx } = this; const b = this.ball;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const s = this.glowSprite('#ffffff');
    b.trail.forEach((q, i) => { ctx.globalAlpha = (1 - i / b.trail.length) * 0.25; const z = 7 - i * 0.4; ctx.drawImage(s, q.x - z, q.y - z, z * 2, z * 2); });
    ctx.restore(); ctx.save();
    ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 5, 0, Math.PI * 2); ctx.fillStyle = '#f8fafc'; ctx.fill();
    ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 1.8, 0, Math.PI * 2); ctx.fillStyle = '#0f172a'; ctx.fill();
    ctx.restore();
  }

  private drawParticles(t: number) {
    if (!this.particles.length) return;
    const { ctx } = this;
    ctx.save();
    for (const q of this.particles) {
      if (t < q.t0) continue;
      const u = (t - q.t0) / q.life;
      ctx.globalAlpha = Math.max(0, 1 - u * u);
      ctx.fillStyle = q.color;
      const w = q.size * Math.abs(Math.cos(q.spin)) + 1;
      ctx.fillRect(q.x - w / 2, q.y - q.size / 2, w, q.size);
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
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(6,11,24,0.82)'; ctx.fill(); ctx.strokeStyle = hexA(c.color, 0.9); ctx.lineWidth = c.big ? 2 : 1.2; ctx.stroke();
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
        const h = 18; roundRect(ctx, x, y - h / 2, w, h, 9); ctx.fillStyle = 'rgba(20,33,66,0.95)'; ctx.fill(); ctx.strokeStyle = 'rgba(148,163,196,0.35)'; ctx.lineWidth = 1; ctx.stroke();
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
      roundRect(ctx, x, y - h / 2, w, h, 10); ctx.fillStyle = 'rgba(15,26,53,0.96)'; ctx.fill();
      ctx.strokeStyle = hexA(flash > 0 ? f.flashColor : col, 0.5 + flash * 0.5 + (f.state === 'DEBATE' ? Math.sin(t / 200) * 0.15 : 0)); ctx.lineWidth = 1.2 + flash * 1.5; ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = C.text; ctx.font = `700 ${L.mode === 'wide' ? 11 : 10}px ${this.font}`;
      if (L.mode === 'wide') ctx.fillText(fit(ctx, `${teamShort(f.home)} – ${teamShort(f.away)}`, w - 16), x + 8, y - 8);
      else { ctx.fillText(fit(ctx, teamShort(f.home), w - 10), x + 6, y - 11); ctx.fillText(fit(ctx, teamShort(f.away), w - 10), x + 6, y + 1); }
      ctx.font = `700 9px ${this.font}`; ctx.fillStyle = col;
      const label = f.state === 'RESEARCH' ? 'DATE + ISTORIC' : f.state === 'ANALYSIS' ? 'ANALIZĂ' : f.state === 'DEBATE' ? 'DEZBATERE' : 'VOT · CREIER';
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
    for (const [p, label, col] of [[L.src, 'DATE · COTE · ISTORIC', C.cyan], [L.news, 'PRESĂ', C.lime]] as const) {
      const s = this.glowSprite(col); ctx.globalAlpha = 0.5 + Math.sin(t / 500) * 0.15; ctx.drawImage(s, p.x - 14, p.y - 14, 28, 28); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = hexA(col, 0.9); ctx.fillText(label, p.x + 9, p.y - 4);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(148,163,196,0.55)';
    ctx.fillText(`${this.fpsAcc.value || '—'} FPS`, L.pitch.x + L.pitch.w - 10, L.pitch.y + L.pitch.h - 16);
    if (this.banner) {
      ctx.font = `700 11px ${this.font}`; ctx.textAlign = 'center';
      const w = ctx.measureText(this.banner.text).width + 24; const x = L.pitch.x + L.pitch.w / 2 - w / 2, y = L.pitch.y + 12;
      roundRect(ctx, x, y, w, 22, 11); ctx.fillStyle = 'rgba(6,11,24,0.9)'; ctx.fill(); ctx.strokeStyle = this.banner.color; ctx.stroke();
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
