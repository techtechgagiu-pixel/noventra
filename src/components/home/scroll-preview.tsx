'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';

/**
 * Entrance preview (owner request 03.11: "să plece automat"). A short muted clip loops on its own, styled like a
 * match broadcast: the caption runs in a scoreboard strip ("lower third") that follows the clip's own timeline.
 * It stops while off screen and can be paused (WCAG 2.2.2: moving content longer than 5 s needs a pause control).
 * Without JS the poster and the three lines stay readable.
 */
const LINES = [
  { until: 0.34, title: '11 agenți AI', text: 'Fiecare cu alt rol: prudent, tactician, contrarian, om de știri.' },
  { until: 0.68, title: 'Citesc meciul', text: 'Cote, formă, meciuri directe și știrile zilei.' },
  { until: 1.01, title: 'Votează biletul', text: 'Pe bilet ajung doar selecțiile susținute de echipă.' },
];

export function ScrollPreview() {
  const section = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const userPaused = useRef(false);
  const [line, setLine] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = section.current, v = video.current;
    if (!el || !v) return;
    el.classList.add('sv-live');
    let raf = 0;
    const tick = () => {
      const p = v.duration ? v.currentTime / v.duration : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      setLine((cur) => { const next = LINES.findIndex((l) => p < l.until); return next === -1 || next === cur ? cur : next; });
      raf = requestAnimationFrame(tick);
    };
    const onPlay = () => { setPlaying(true); if (!raf) raf = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    v.addEventListener('play', onPlay); v.addEventListener('pause', onPause);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !userPaused.current) void v.play().catch(() => {});
      else if (!e.isIntersecting) v.pause();
    }, { threshold: 0.25 });
    io.observe(el);
    return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); };
  }, []);

  const toggle = () => {
    const v = video.current; if (!v) return;
    if (v.paused) { userPaused.current = false; void v.play().catch(() => {}); } else { userPaused.current = true; v.pause(); }
  };
  const l = LINES[line];

  return <section ref={section} className="scroll-preview" aria-label="Pe scurt: cum lucrează agenții">
    <div className="sv-pin">
      <div className="sv-media">
        <video ref={video} className="sv-video" muted loop playsInline autoPlay preload="auto" poster="/video/primul11-preview-v2.jpg" disablePictureInPicture {...{ 'webkit-playsinline': 'true' }} aria-hidden="true" tabIndex={-1}>
          <source src="/video/primul11-preview-v2.mp4" type="video/mp4" />
          <source src="/video/primul11-preview-v2.webm" type="video/webm" />
        </video>
      </div>
      <div className="sv-scrim" aria-hidden="true" />
      <button type="button" className="sv-toggle" onClick={toggle} aria-label={playing ? 'Oprește clipul' : 'Pornește clipul'}>{playing ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}</button>
      {/* Scoreboard strip: the step of the clip on the left, the caption on the right. */}
      <div className="sv-strip" aria-live="off">
        <div className="sv-strip-badge"><img src="/logo.svg" alt="" width={22} height={22} /><span className="sv-strip-step">{line + 1}/3</span></div>
        <div key={line} className="sv-strip-copy"><h2>{l.title}</h2><p>{l.text}</p></div>
        <div className="sv-progress" aria-hidden="true"><div ref={bar} /></div>
      </div>
      <noscript><div className="sv-noscript">{LINES.map((x) => <p key={x.title}><strong>{x.title}.</strong> {x.text}</p>)}</div></noscript>
    </div>
  </section>;
}
