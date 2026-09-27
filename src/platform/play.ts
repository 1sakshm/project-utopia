import { create } from 'zustand';

/** Cross-component play-session UI state. */
interface PlayUi {
  /** Rect of the card the player tapped Play on (for the expand transition). */
  originRect: DOMRect | null;
  /** True when the overlay was opened from within the app (so Exit can history.back()). */
  openedInApp: boolean;
  announce: string;
  setOrigin: (r: DOMRect | null) => void;
  say: (text: string) => void;
}

export const usePlayUi = create<PlayUi>((set) => ({
  originRect: null,
  openedInApp: false,
  announce: '',
  setOrigin: (r) => set({ originRect: r, openedInApp: true }),
  say: (text) => set({ announce: text }),
}));
