import { create } from 'zustand';

/** Cross-component play-session UI state. */
interface PlayUi {
  /** Rect of the card the player tapped Play on (for the expand transition). */
  originRect: DOMRect | null;
  /** True when the overlay was opened from within the app (so Exit can history.back()). */
  openedInApp: boolean;
  announce: string;
  /** Number of play overlays mounted (the app hides its nav while > 0). */
  overlays: number;
  /** Call on mount; returns the unmount cleanup. */
  overlayOpened: () => () => void;
  setOrigin: (r: DOMRect | null) => void;
  say: (text: string) => void;
}

export const usePlayUi = create<PlayUi>((set) => ({
  originRect: null,
  openedInApp: false,
  announce: '',
  overlays: 0,
  overlayOpened: () => {
    set((s) => ({ overlays: s.overlays + 1 }));
    return () => set((s) => ({ overlays: Math.max(0, s.overlays - 1) }));
  },
  setOrigin: (r) => set({ originRect: r, openedInApp: true }),
  say: (text) =>
    set((s) => {
      // One polite live region for the whole app. Messages arriving together are joined so a later one can't
      // replace an earlier one before it's read, and a repeat gets a different trailing space so it's read again.
      const now = Date.now();
      const joined = now - lastSay < 400 && s.announce ? `${s.announce.trim()} ${text}` : text;
      lastSay = now;
      return { announce: joined === s.announce.trim() ? joined + (s.announce.endsWith(' ') ? ' ' : ' ') : joined };
    }),
}));

let lastSay = 0;
