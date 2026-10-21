'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AGENT_META } from '@/lib/format';
import type { NexusEvent } from '@/lib/nexus-state';
import { FORMATION, MapScene } from './map-scene';

export type AgentMapHandle = { replay: (speed?: number) => void };
type Info = Record<string, { title: string; specialty: string; maxOdds: number; minProbability: number; model?: string | null }>;

/**
 * Canvas map of the team (60 fps). History present at mount is applied instantly; anything newer flows in animated.
 * onProgress reports the last event the map has shown, so the chat below stays in sync with the animation.
 */
type Props = { events: NexusEvent[]; target: number; info?: Info; onProgress: (seq: number) => void;
  /** Showcase mode: replays `events` from the start at `speed`, then loops after a pause. */
  autoplay?: { speed: number; pauseMs: number }; height?: (width: number) => number; className?: string };
export const AgentMap = forwardRef<AgentMapHandle, Props>(function AgentMap({ events, target, info, onProgress, autoplay, height, className }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<MapScene | null>(null);
  const fed = useRef(0);
  const progress = useRef(0);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const c = canvas.current!; const w = wrap.current!;
    const s = new MapScene(c, { onProgress: (seq) => { progress.current = seq; }, onAgentHover: setHover });
    s.reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.setTarget(target);
    scene.current = s;
    const size = () => { const width = w.clientWidth; const h = height ? height(width) : width < 640 ? Math.min(1100, Math.max(760, width * 2.5)) : Math.min(600, Math.max(380, width * 0.52)); s.resize(width, h); };
    size();
    const ro = new ResizeObserver(size); ro.observe(w);
    // Draw only while visible: the browser already pauses rAF in background tabs.
    const io = new IntersectionObserver(([en]) => (en.isIntersecting ? s.start() : s.stop()), { threshold: 0.01 }); io.observe(c);
    // Sync the chat with what the map has played, ~10 times per second (no per-frame React work).
    let shown = 0;
    const tick = setInterval(() => { if (progress.current !== shown) { shown = progress.current; onProgress(shown); } }, 100);
    // Showcase loop: when everything has played, wait, then start again from the beginning.
    let idleSince = 0;
    const loop = autoplay ? setInterval(() => {
      if (!events.length || s.pending() > 0) { idleSince = 0; return; }
      idleSince ||= Date.now();
      if (Date.now() - idleSince > autoplay.pauseMs) { idleSince = 0; s.reset(); s.speed = autoplay.speed; progress.current = 0; onProgress(0); s.push(events, true); }
    }, 500) : null;
    if (autoplay) { s.speed = autoplay.speed; s.push(events, true); fed.current = events.at(-1)?.seq ?? 0; }
    return () => { ro.disconnect(); io.disconnect(); clearInterval(tick); if (loop) clearInterval(loop); s.destroy(); scene.current = null; fed.current = 0; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = scene.current; if (!s || autoplay) return;
    const fresh = events.filter((e) => e.seq > fed.current);
    if (!fresh.length) return;
    if (fed.current === 0) {
      // First feed: old history appears instantly, the last ~20 s are animated.
      const cutoff = Date.now() - 20_000;
      const old = fresh.filter((e) => Date.parse(e.createdAt) < cutoff);
      s.push(old, false);
      s.push(fresh.filter((e) => Date.parse(e.createdAt) >= cutoff), true);
    } else s.push(fresh, true);
    fed.current = fresh.at(-1)!.seq;
  }, [events]);

  useImperativeHandle(ref, () => ({
    replay: (speed = 2.5) => {
      const s = scene.current; if (!s) return;
      s.reset(); s.speed = speed; progress.current = 0; onProgress(0);
      s.push(events, true);
      fed.current = events.at(-1)?.seq ?? 0;
    },
  }), [events, onProgress]);

  const h = hover ? AGENT_META[hover] : null;
  const hi = hover ? info?.[hover] : null;
  return (
    <div ref={wrap} className={className ?? "relative overflow-hidden rounded-[1.25rem] border border-line bg-ink"}>
      <canvas ref={canvas} role="img" aria-label="Harta live a agenților: cine analizează, cine dezbate și ce meciuri ajung pe bilet" />
      {h && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-[min(320px,80%)] rounded-xl border border-line bg-ink/95 p-3 text-xs shadow-xl">
          <p className="font-bold" style={{ color: h.accent }}>{h.name} <span className="font-normal text-muted">· {FORMATION.find((f) => f.id === hover)?.line}</span></p>
          {hi && <><p className="mt-1 text-muted">{hi.title}</p><p className="mt-1">{hi.specialty}</p><p className="mt-1 text-muted">Cotă max {hi.maxOdds.toFixed(2)} · prob. ≥ {Math.round(hi.minProbability * 100)}%{hi.model ? ` · ${hi.model}` : ''}</p></>}
        </div>
      )}
    </div>
  );
});
