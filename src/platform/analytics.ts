import type { PostHog } from 'posthog-js';
import { useSettings } from './settings';

/**
 * Typed product analytics (PRD §21).
 * Events are sent to PostHog only when a project key is configured (VITE_POSTHOG_KEY) and the player
 * hasn't turned analytics off in Settings. Anonymous by design: a random ID kept in localStorage
 * (no cookies), no names, emails or per-trial gameplay data. Honors the browser's Do Not Track.
 */
export type AnalyticsEvent =
  | { name: 'app_open'; is_pwa: boolean; tier?: string; reduced_motion: boolean; days_since_first?: number; total_sessions?: number; returning?: boolean }
  | { name: 'feed_card_impression'; game_id: string; position: number; variant: string; preview_mode: string; dwell_ms: number }
  | { name: 'feed_card_action'; game_id: string; action: 'play' | 'info' | 'favorite' | 'sound' }
  | { name: 'game_load'; game_id: string; tti_ms: number; from: string }
  | { name: 'game_session_end'; game_id: string; score: number; level_reached: number; duration_ms: number; is_pb: boolean }
  | { name: 'game_exit'; game_id: string; state: string; elapsed_ms: number }
  | { name: 'game_action'; game_id: string; action: 'restart' | 'play_again' | 'next_game' | 'pause' }
  | { name: 'setting_changed'; key: string; value: string }
  | { name: 'wellbeing_reminder'; action: 'shown' | 'dismiss' | 'still-water' }
  | { name: 'feedback_click'; from: string }
  | { name: 'landing_cta'; where: string }
  | { name: 'share'; what: string }
  | { name: 'client_error'; where: string; message: string }
  | { name: 'daily_complete'; day: string }
  | { name: 'star_earned'; game_id: string; stars: number }
  | { name: 'ad_request'; placement: string }
  | { name: 'ad_result'; placement: string; result: string }
  | { name: 'reward'; source: 'session' | 'quest' | 'double'; orbs: number }
  | { name: 'shop_purchase'; item: string; price: number }
  | { name: 'boost_used'; kind: string; via: 'inventory' | 'orbs' | 'ad'; game_id: string }
  | { name: 'revive'; game_id: string; via: 'ad' | 'second-wind' | 'declined' };

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com';
// Don't pollute production data from local development / automated tests unless explicitly asked.
const ALLOW_DEV = import.meta.env.VITE_POSTHOG_DEV === '1';

const buffer: Array<AnalyticsEvent & { t: number; session: string }> = [];
const session = Math.random().toString(36).slice(2);

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
const pending: Array<[string, Record<string, unknown>]> = [];

const dnt = () => {
  const n = navigator as Navigator & { msDoNotTrack?: string };
  return n.doNotTrack === '1' || n.msDoNotTrack === '1' || (window as Window & { doNotTrack?: string }).doNotTrack === '1';
};

/** True when remote analytics may be sent right now. */
export function remoteEnabled(): boolean {
  if (!KEY || (import.meta.env.DEV && !ALLOW_DEV)) return false;
  return useSettings.getState().analytics && !dnt();
}

function load(): Promise<PostHog | null> {
  if (loading) return loading;
  loading = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY!, {
        api_host: HOST,
        persistence: 'localStorage', // no cookies
        autocapture: false, // only our typed events (never raw clicks/inputs)
        capture_pageview: false, // SPA: page views are sent explicitly on route change
        capture_pageleave: false,
        disable_session_recording: true,
        respect_dnt: true,
        person_profiles: 'always', // anonymous profiles, so unique + returning players can be counted
      });
      posthog.register({
        app: 'utopia-web',
        is_pwa: window.matchMedia('(display-mode: standalone)').matches,
      });
      client = posthog;
      for (const [name, props] of pending.splice(0)) posthog.capture(name, props);
      return posthog;
    })
    .catch(() => null);
  return loading;
}

function send(name: string, props: Record<string, unknown>) {
  if (!remoteEnabled()) return;
  if (client) client.capture(name, props);
  else {
    if (pending.length < 200) pending.push([name, props]);
    void load();
  }
}

export function track(e: AnalyticsEvent) {
  const rec = { ...e, t: Date.now(), session };
  buffer.push(rec);
  if (buffer.length > 500) buffer.shift();
  const { name, ...props } = e;
  send(name, props);
  if (import.meta.env.DEV) console.debug('[analytics]', e.name, e);
}

/** SPA page view (call on route change). */
export function trackPage(path: string) {
  // Full URL incl. query string, so ?utm_source=... links show which community a visitor came from.
  send('$pageview', { $current_url: window.location.href, path });
}

// Turning analytics off/on in Settings takes effect immediately.
useSettings.subscribe((s, prev) => {
  if (s.analytics === prev.analytics || !client) return;
  if (s.analytics) client.opt_in_capturing();
  else client.opt_out_capturing();
});

export const analyticsBuffer = () => [...buffer];
