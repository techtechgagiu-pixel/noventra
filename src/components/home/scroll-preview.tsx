'use client';
import { useEffect, useRef } from 'react';

/**
 * Owner request 02.11: a quick preview at the entrance of the site. The clip never plays on its own: the scroll
 * position drives currentTime (lerped, snapped to a frame), the section stays sticky while the clip runs, then the
 * page continues. Every frame of the file is a keyframe (ffmpeg keyint=1), so each seek decodes a single frame.
 * Without JS, a decodable video, or with reduced motion: a plain section with the poster and the three lines.
 */
const LINES = [
  { from: 0, to: 0.36, title: '11 agenți AI', text: 'Fiecare cu alt rol: prudent, tactician, contrarian, om de știri.' },
  { from: 0.32, to: 0.7, title: 'Citesc meciul', text: 'Cote, formă, meciuri directe și știrile zilei, pentru fiecare meci.' },
  { from: 0.66, to: 1.01, title: 'Votează biletul', text: 'Pe bilet ajung doar selecțiile susținute de echipă.' },
];

export function ScrollPreview() {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const lines = useRef<Array<HTMLDivElement | null>>([]);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = section.current, v = video.current;
    if (!el || !v) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (reduced || typeof v.canPlayType !== 'function' || (!v.canPlayType('video/mp4') && !v.canPlayType('video/webm'))) {
      el.classList.add('sv-fallback');
      const on = () => el.classList.add('sv-playing'), off = () => el.classList.remove('sv-playing');
      v.addEventListener('play', on); v.addEventListener('ended', off); v.addEventListener('pause', off);
      return () => { v.removeEventListener('play', on); v.removeEventListener('ended', off); v.removeEventListener('pause', off); };
    }
    el.classList.add('sv-live');
    const LERP = touch ? 0.22 : 0.14, FRAME = 1 / 24;
    let duration = 0, current = 0, raf = 0, ready = false, unlocked = false, pending: number | null = null, seekAt = 0, visible = false;

    const seek = (t: number) => {
      const c = Math.max(0, Math.min(duration - 0.001, t));
      if (v.seeking && performance.now() - seekAt < 220) { pending = c; return; }
      pending = null; seekAt = performance.now();
      const fast = (v as HTMLVideoElement & { fastSeek?: (t: number) => void }).fastSeek;
      if (fast) fast.call(v, c); else v.currentTime = c;
    };
    const progress = () => {
      const r = el.getBoundingClientRect();
      const run = r.height - window.innerHeight;
      return run > 0 ? Math.max(0, Math.min(1, -r.top / run)) : 0;
    };
    const paint = (p: number) => {
      LINES.forEach((l, i) => {
        const node = lines.current[i]; if (!node) return;
        const span = l.to - l.from, k = (p - l.from) / span;
        const o = k < 0 || k > 1 ? 0 : Math.min(1, k / 0.22, (1 - k) / 0.22);
        node.style.opacity = String(o); node.style.transform = `translateY(${(1 - o) * 14}px)`;
      });
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    const tick = () => {
      raf = 0;
      const p = progress();
      if (ready) {
        const target = p * duration;
        current += (target - current) * LERP;
        if (Math.abs(target - current) < FRAME * 0.5) current = target;
        if (Math.abs(current - v.currentTime) >= FRAME * 0.5) seek(current);
        paint(duration ? current / duration : p);
        if (Math.abs(target - current) > 0.0005 && visible) raf = requestAnimationFrame(tick);
      } else paint(p);
    };
    const wake = () => { if (!raf && visible) raf = requestAnimationFrame(tick); };
    const unlock = () => {
      if (unlocked || !ready) return;
      unlocked = true;
      const p = v.play();
      if (p && p.then) p.then(() => { v.pause(); seek(current); }).catch(() => {});
    };
    const onMeta = () => { duration = v.duration || 0; ready = duration > 0; wake(); };
    const onSeeked = () => { if (pending !== null) { const q = pending; pending = null; seek(q); } };
    const noPlay = () => { if (!unlocked) v.pause(); };
    const onError = () => { el.classList.remove('sv-live'); el.classList.add('sv-fallback'); };
    v.addEventListener('loadedmetadata', onMeta); v.addEventListener('seeked', onSeeked); v.addEventListener('play', noPlay); v.addEventListener('error', onError);
    if (v.readyState >= 1) onMeta();
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) { v.preload = 'auto'; wake(); }
    }, { rootMargin: '20% 0px' });
    io.observe(el);
    const gestures = ['pointerdown', 'touchstart', 'keydown', 'wheel'] as const;
    const once = () => { unlock(); gestures.forEach((g) => window.removeEventListener(g, once)); };
    gestures.forEach((g) => window.addEventListener(g, once, { passive: true }));
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake);
    return () => {
      io.disconnect(); if (raf) cancelAnimationFrame(raf);
      gestures.forEach((g) => window.removeEventListener(g, once));
      window.removeEventListener('scroll', wake); window.removeEventListener('resize', wake);
      v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('seeked', onSeeked); v.removeEventListener('play', noPlay); v.removeEventListener('error', onError);
    };
  }, []);

  return <section ref={section} className="scroll-preview" aria-label="Pe scurt: cum lucrează agenții">
    <div className="sv-pin">
      <div className="sv-media">
      <video ref={video} className="sv-video" muted playsInline preload="metadata" poster="/video/primul11-preview.jpg" disablePictureInPicture {...{ 'webkit-playsinline': 'true' }} aria-hidden="true" tabIndex={-1}>
        <source src="/video/primul11-preview.mp4" type="video/mp4" />
        <source src="/video/primul11-preview.webm" type="video/webm" />
      </video>
      {/* Reduced motion (31.10: the owner's Mac has it on) or no scrubbing: the clip plays only when asked. */}
      <button type="button" className="sv-play" onClick={() => { const v = video.current; if (!v) return; v.currentTime = 0; void v.play().catch(() => {}); }}>▶ Vezi preview-ul (6 s)</button>
      </div>
      <div className="sv-scrim" aria-hidden="true" />
      <div className="sv-lines">
        {LINES.map((l, i) => <div key={l.title} ref={(n) => { lines.current[i] = n; }} className="sv-line"><p className="sv-step">{i + 1} / 3</p><h2>{l.title}</h2><p>{l.text}</p></div>)}
      </div>
      <div className="sv-progress" aria-hidden="true"><div ref={bar} /></div>
      <p className="sv-hint" aria-hidden="true">Derulează</p>
    </div>
  </section>;
}
