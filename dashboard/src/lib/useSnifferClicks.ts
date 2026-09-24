import { useEffect, useRef } from "react";
import { clickTiming } from "./sniffer";

/**
 * Geiger-counter clicks through Web Audio, paced by the live response. An
 * operator sweeping a probe watches the ground, not the screen, so sound
 * carries the signal. Browsers only allow audio after a user gesture, so the
 * AudioContext is created by the toggle that turns sound on (`unlock`).
 */
export function useSnifferClicks(response: number | null, enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const responseRef = useRef(response);

  useEffect(() => {
    responseRef.current = response;
  }, [response]);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    let lastClick = 0;

    const tick = () => {
      const ctx = ctxRef.current;
      const timing = clickTiming(responseRef.current);
      const now = performance.now();
      if (ctx && timing && now - lastClick >= timing.intervalMs) {
        lastClick = now;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = timing.frequencyHz;
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.035);
      }
      timer = window.setTimeout(tick, 20);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [enabled]);

  useEffect(() => () => void ctxRef.current?.close(), []);

  return {
    /** Call from the click handler that enables sound. */
    unlock() {
      if (!ctxRef.current) ctxRef.current = new AudioContext();
      void ctxRef.current.resume();
    },
  };
}
