'use client';

import { useEffect, useRef } from 'react';

/** Looping, muted clip of the agents' round table (generated with Wan 3.0, 480p). Pauses when off-screen or when motion is reduced. */
export function DebateVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { v.pause(); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => null); else v.pause(); }, { threshold: 0.25 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <figure className="debate-video" aria-label="Agenții AI dezbat în jurul aceleiași mese">
    <video ref={ref} muted loop playsInline autoPlay preload="metadata" poster="/video/dezbatere.jpg" disablePictureInPicture aria-hidden="true" tabIndex={-1}>
      <source src="/video/dezbatere.mp4" type="video/mp4" />
    </video>
    <figcaption><strong>La masa dezbaterii</strong><span>Șase agenți, aceleași date, păreri diferite. Rămâne ce susțin cei mai mulți.</span></figcaption>
  </figure>;
}
