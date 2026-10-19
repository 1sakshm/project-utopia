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
  say: (text) => set({ announce: text }),
}));
