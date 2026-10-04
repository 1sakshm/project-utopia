import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';
import type { GameSettings } from '@/sdk/types';

export interface Settings {
  highContrast: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  previewStyle: 'auto' | 'live' | 'still';
  textScale: number;
  readingFont: 'default' | 'atkinson';
  /** App look: 'soft' = neumorphism (light, extruded surfaces); 'aurora' = the original dark glass look. */
  uiStyle: 'soft' | 'aurora';
  flashIntensity: 'normal' | 'reduced' | 'none';
  master: number;
  music: number;
  sfx: number;
  voice: number;
  feedSound: boolean;
  mono: boolean;
  captions: boolean;
  haptics: boolean;
  timing: 'standard' | 'relaxed15' | 'relaxed2' | 'none';
  resumeCountdown: boolean;
  confirmExit: boolean;
  hideFastReaction: boolean;
  hideAudioDependent: boolean;
  leftHanded: boolean;
  showKeyHints: boolean;
  breakReminderMin: 0 | 20 | 40;
  weeklyGoalMin: 0 | 15 | 30 | 60;
  /** Opt-in weekly rhythm: play on N of the 7 days this week (the rest are rest days). 0 = off. */
  rhythmDays: 0 | 3 | 4 | 5;
  graphics: 'auto' | 'battery' | 'high';
  analytics: boolean;
  /** Voice games: language spoken by the game voice (Sarvam bulbul) and expected in answers. */
  voiceLang: 'en-IN' | 'hi-IN';
  voiceGender: 'female' | 'male';
  /** How voice games take answers: ask once, microphone (Sarvam speech-to-text), or typing. */
  voiceInput: 'ask' | 'mic' | 'typing';
  /** Offer optional boosts (slow-mo, second wind) before a game starts. */
  showBoostPicker: boolean;
  calibrationMs: number;
}

export const defaultSettings: Settings = {
  highContrast: false,
  reducedMotion: 'system',
  previewStyle: 'auto',
  textScale: 1,
  readingFont: 'default',
  uiStyle: 'soft',
  flashIntensity: 'normal',
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  voice: 0.9,
  feedSound: false,
  mono: false,
  captions: false,
  haptics: true,
  timing: 'standard',
  resumeCountdown: true,
  confirmExit: true,
  hideFastReaction: false,
  hideAudioDependent: false,
  leftHanded: false,
  showKeyHints: false,
  breakReminderMin: 40,
  weeklyGoalMin: 0,
  rhythmDays: 0,
  graphics: 'auto',
  analytics: true, // anonymous usage stats (no cookies, no PII); can be turned off in Settings
  voiceLang: 'en-IN',
  voiceGender: 'female',
  voiceInput: 'ask',
  showBoostPicker: true,
  calibrationMs: 0,
};

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      set: (patch) => set(patch),
      reset: () => set(defaultSettings),
    }),
    {
      name: 'utopia.settings',
      storage: safeJSONStorage(),
      version: 2,
      // v2: anonymous analytics became on-by-default (with an off switch). Earlier saves stored the old
      // default (off) without the player ever choosing it, so they move to the new default once.
      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as Partial<Settings>;
        return (version < 2 ? { ...st, analytics: true } : st) as SettingsStore;
      },
    },
  ),
);

const mqReduced = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export function prefersReducedMotion(s: Settings = useSettings.getState()): boolean {
  if (s.reducedMotion === 'on') return true;
  if (s.reducedMotion === 'off') return false;
  return !!mqReduced?.matches;
}

export function toGameSettings(s: Settings = useSettings.getState()): GameSettings {
  return {
    reducedMotion: prefersReducedMotion(s),
    highContrast: s.highContrast,
    timingMultiplier: s.timing === 'relaxed15' ? 1.5 : s.timing === 'relaxed2' || s.timing === 'none' ? 2 : 1,
    noTimePressure: s.timing === 'none',
    flashIntensity: s.flashIntensity,
    captions: s.captions,
    showKeyHints: s.showKeyHints,
    readingFont: s.readingFont,
    textScale: s.textScale,
    leftHanded: s.leftHanded,
  };
}
