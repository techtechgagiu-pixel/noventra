'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type Cue = 'complete' | 'debate' | 'vote' | 'ticket' | 'error';
const KEY = 'bm-sound';

/** Subtle synthesized NEXUS audio. Muted by default; starts only after an explicit user click. */
export function useNexusSound(processing: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const ctx = useRef<AudioContext | null>(null);
  const hum = useRef<{ osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null>(null);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); if (typeof s.volume === 'number') setVolume(s.volume); } catch { /* storage unavailable */ }
  }, []);
  const persist = (v: number) => { try { localStorage.setItem(KEY, JSON.stringify({ volume: v })); } catch { /* ignore */ } };

  const ensure = useCallback(() => {
    if (!ctx.current) ctx.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.current.state === 'suspended') void ctx.current.resume();
    return ctx.current;
  }, []);

  const toggle = useCallback(() => { setEnabled((e) => { if (!e) ensure(); return !e; }); }, [ensure]);

  // Processing hum: only while a real backend job is actively working.
  useEffect(() => {
    if (!enabled || !processing) { if (hum.current) { hum.current.gain.gain.setTargetAtTime(0, ctx.current!.currentTime, 0.2); const h = hum.current; setTimeout(() => { h.osc.stop(); h.lfo.stop(); }, 600); hum.current = null; } return; }
    const c = ensure();
    const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = 110;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.4;
    const lfoGain = c.createGain(); lfoGain.gain.value = 6; lfo.connect(lfoGain).connect(osc.frequency);
    const gain = c.createGain(); gain.gain.value = 0; osc.connect(gain).connect(c.destination);
    osc.start(); lfo.start(); gain.gain.setTargetAtTime(0.025 * volume, c.currentTime, 0.4);
    hum.current = { osc, lfo, gain };
    return () => { gain.gain.setTargetAtTime(0, c.currentTime, 0.1); setTimeout(() => { osc.stop(); lfo.stop(); }, 300); hum.current = null; };
  }, [enabled, processing, volume, ensure]);

  const cue = useCallback((kind: Cue) => {
    if (!enabled) return;
    const c = ensure();
    const notes: Record<Cue, number[]> = { complete: [660, 880], debate: [440, 520], vote: [740], ticket: [523, 659, 784, 1046], error: [220, 180] };
    notes[kind].forEach((f, i) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = kind === 'error' ? 'triangle' : 'sine'; o.frequency.value = f;
      const t = c.currentTime + i * 0.11;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08 * volume, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.4);
    });
  }, [enabled, volume, ensure]);

  return { enabled, toggle, volume, setVolume: (v: number) => { setVolume(v); persist(v); }, cue };
}
