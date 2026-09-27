import { useSettings } from './settings';

/**
 * Typed product analytics (PRD §21). V1 keeps events on-device (ring buffer) — an adapter
 * (e.g. PostHog, cookieless) can be plugged into `send` when a key is configured.
 * Per-trial data is never tracked here.
 */
export type AnalyticsEvent =
  | { name: 'app_open'; is_pwa: boolean; tier?: string; reduced_motion: boolean }
  | { name: 'feed_card_impression'; game_id: string; position: number; variant: string; preview_mode: string; dwell_ms: number }
  | { name: 'feed_card_action'; game_id: string; action: 'play' | 'info' | 'favorite' | 'sound' }
  | { name: 'game_load'; game_id: string; tti_ms: number; from: string }
  | { name: 'game_session_end'; game_id: string; score: number; level_reached: number; duration_ms: number; is_pb: boolean }
  | { name: 'game_exit'; game_id: string; state: string; elapsed_ms: number }
  | { name: 'game_action'; game_id: string; action: 'restart' | 'play_again' | 'next_game' | 'pause' }
  | { name: 'setting_changed'; key: string; value: string }
  | { name: 'wellbeing_reminder'; action: 'shown' | 'dismiss' | 'still-water' };

const buffer: Array<AnalyticsEvent & { t: number; session: string }> = [];
const session = Math.random().toString(36).slice(2);

export function track(e: AnalyticsEvent) {
  const rec = { ...e, t: Date.now(), session };
  buffer.push(rec);
  if (buffer.length > 500) buffer.shift();
  if (useSettings.getState().analytics) send(rec);
  if (import.meta.env.DEV) console.debug('[analytics]', e.name, e);
}

function send(_e: AnalyticsEvent & { t: number }) {
  // Adapter hook: no remote endpoint configured in V1.
}

export const analyticsBuffer = () => [...buffer];
