'use client';

import { useEffect, useRef } from 'react';

/** Looping, muted clip of the agents' round table (generated with Wan 3.0, 480p). Starts by itself (muted) and pauses when off-screen. */
export function DebateVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    // React does not always set the muted attribute before the browser decides on autoplay, so force it and start right away.
    v.muted = true; v.defaultMuted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    const start = () => { v.play().catch(() => null); };
    start();
    v.addEventListener('loadeddata', start); v.addEventListener('canplay', start);
    // Browsers that still block it (low-power mode) start it on the first touch or click anywhere.
    const unlock = () => { start(); };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('scroll', unlock, { once: true, passive: true });
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); else v.pause(); }, { threshold: 0.2 });
    io.observe(v);
    return () => { io.disconnect(); v.removeEventListener('loadeddata', start); v.removeEventListener('canplay', start); window.removeEventListener('pointerdown', unlock); window.removeEventListener('scroll', unlock); };
  }, []);
  return <figure className="debate-video" aria-label="Agenții AI dezbat în jurul aceleiași mese">
    <video ref={ref} muted loop playsInline autoPlay preload="auto" poster="/video/dezbatere.jpg" disablePictureInPicture aria-hidden="true" tabIndex={-1}>
      <source src="/video/dezbatere.mp4" type="video/mp4" />
    </video>
    <figcaption><strong>La masa dezbaterii</strong><span>Șase agenți, aceleași date, păreri diferite. Rămâne ce susțin cei mai mulți.</span></figcaption>
  </figure>;
}
