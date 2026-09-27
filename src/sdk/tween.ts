import type { GameContext } from './types';
import { easeOutCubic } from './util';

/**
 * Pause-aware tween driven by ctx.loop. Resolves when finished (never resolves if destroyed first).
 * `onUpdate` receives eased progress 0..1.
 */
export function tween(
  ctx: GameContext,
  durationMs: number,
  onUpdate: (t: number) => void,
  ease: (t: number) => number = easeOutCubic,
): Promise<void> & { cancel(): void } {
  let cancel = () => {};
  const p = new Promise<void>((resolve) => {
    if (durationMs <= 0) {
      onUpdate(1);
      resolve();
      return;
    }
    let elapsed = 0;
    const stop = ctx.loop((dt) => {
      elapsed += dt;
      const t = Math.min(1, elapsed / durationMs);
      onUpdate(ease(t));
      if (t >= 1) {
        stop();
        resolve();
      }
    }, 10);
    cancel = () => stop();
  }) as Promise<void> & { cancel(): void };
  p.cancel = () => cancel();
  return p;
}
