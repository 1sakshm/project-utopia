// Accounts-without-accounts: sign-in with the device key, @handles, profiles, friends and challenges
// (live 1v1 invites, and async "Beat my score" challenges that replay the exact same game).
import { create } from 'zustand';
import { useProfile } from './profile';
import { useEconomy } from './economy';
import { VERSUS_HTTP, randomPoolGame } from './versus/config';
import type { AsyncChallengeView, FriendView, InviteView, PublicProfile, ScoreMode } from './versus/protocol';

export interface RecentMatch {
  gameId: string | null;
  kind: string;
  ranked: boolean;
  at: number;
  place: number;
  score: number;
  delta: number | null;
  players: Array<{ handle: string | null; score: number; place: number; rel?: number | null }>;
}

export type Relation = 'self' | 'friends' | 'requested' | 'incoming' | null;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!VERSUS_HTTP) throw new ApiError('Online features aren’t set up on this build.', 0);
  const p = useProfile.getState();
  let res: Response;
  try {
    res = await fetch(VERSUS_HTTP + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Player-Id': p.id, 'X-Player-Key': p.key },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Can’t reach the server. Check your connection.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status);
  return data;
}

// ---------- sign-in ----------
let registering: Promise<PublicProfile | null> | null = null;

type AccountInfo = { hasPassword: boolean; google: string | null };
let onAccount: ((a: AccountInfo) => void) | null = null;
/** account.ts listens here (avoids an import cycle). */
export function setAccountListener(fn: (a: AccountInfo) => void) {
  onAccount = fn;
}

/** Forget the cached sign-in (after switching to another player on this device). */
export function resetSession() {
  registering = null;
  useSocial.setState({ signedIn: false });
}

/** Create or verify this device's player on the server; keeps name/handle/skin in sync. Safe to call often. */
export function ensureRegistered(force = false): Promise<PublicProfile | null> {
  if (!VERSUS_HTTP) return Promise.resolve(null);
  if (registering && !force) return registering;
  const p = useProfile.getState();
  const skin = useEconomy.getState().equipped.skin;
  registering = api<{ me: PublicProfile; account?: AccountInfo }>('POST', '/me/register', { name: p.name, skin })
    .then(({ me, account }) => {
      if (account) onAccount?.(account);
      useSocial.setState({ me, signedIn: true });
      useProfile.setState({ handle: me.handle, name: me.name });
      // A local skin change made while offline wins.
      if (me.skin !== skin) void api('PATCH', '/me', { skin }).catch(() => {});
      return me;
    })
    .catch((e) => {
      registering = null;
      useSocial.setState({ signedIn: false });
      console.warn('[social] sign-in failed', e);
      return null;
    });
  return registering;
}

export async function updateMe(patch: { name?: string; handle?: string; skin?: string }): Promise<PublicProfile> {
  await ensureRegistered();
  const { me } = await api<{ me: PublicProfile }>('PATCH', '/me', patch);
  useSocial.setState({ me });
  useProfile.setState({ handle: me.handle, name: me.name, named: true });
  return me;
}

export async function handleAvailable(h: string): Promise<{ available: boolean; reason?: string }> {
  return api('GET', `/handle/${encodeURIComponent(h.replace(/^@/, ''))}`);
}

export async function getProfile(handle: string) {
  return api<{ profile: PublicProfile; online: boolean; recent: RecentMatch[]; relation: Relation }>('GET', `/u/${encodeURIComponent(handle.replace(/^@/, ''))}`);
}

export async function myHistory() {
  await ensureRegistered();
  return api<{ me: PublicProfile; recent: RecentMatch[] }>('GET', '/me');
}

export async function searchPlayers(q: string): Promise<PublicProfile[]> {
  await ensureRegistered();
  return (await api<{ results: PublicProfile[] }>('GET', `/search?q=${encodeURIComponent(q)}`)).results;
}

// ---------- friends & challenges ----------
const DUEL_MODE_KEY = 'utopia.duelMode';
function loadDuelMode(): ScoreMode {
  try {
    return localStorage.getItem(DUEL_MODE_KEY) === 'friendly' ? 'friendly' : 'standard';
  } catch {
    return 'standard';
  }
}

interface SocialState {
  signedIn: boolean;
  me: PublicProfile | null;
  friends: FriendView[];
  incoming: FriendView[];
  outgoing: FriendView[];
  invites: InviteView[];
  /** "Beat my score" challenges sent to me / by me (expired, unanswered ones are hidden by the server). */
  asyncIn: AsyncChallengeView[];
  asyncOut: AsyncChallengeView[];
  /** Scoring for the friend duels and parties I create. */
  duelMode: ScoreMode;
  setDuelMode: (m: ScoreMode) => void;
  loaded: boolean;
  /** Live challenges waiting for a response (shown as a toast anywhere in the app). */
  toasts: InviteView[];
  refresh: () => Promise<void>;
}

export const useSocial = create<SocialState>((set) => ({
  signedIn: false,
  me: null,
  friends: [],
  incoming: [],
  outgoing: [],
  invites: [],
  asyncIn: [],
  asyncOut: [],
  duelMode: loadDuelMode(),
  setDuelMode: (duelMode) => {
    set({ duelMode });
    try {
      localStorage.setItem(DUEL_MODE_KEY, duelMode);
    } catch {
      /* storage blocked: keep it for this visit */
    }
  },
  loaded: false,
  toasts: [],
  refresh: async () => {
    await ensureRegistered();
    const friends = api<{ friends: FriendView[]; incoming: FriendView[]; outgoing: FriendView[]; invites: InviteView[] }>('GET', '/me/friends')
      .then((r) => set({ ...r, loaded: true }))
      .catch((e) => console.warn('[social] friends', e));
    const asyncs = api<{ incoming: AsyncChallengeView[]; outgoing: AsyncChallengeView[] }>('GET', '/me/async')
      .then((r) => set({ asyncIn: r.incoming, asyncOut: r.outgoing }))
      .catch((e) => console.warn('[social] async challenges', e));
    await Promise.all([friends, asyncs]);
  },
}));

/** Async challenges still waiting for my reply. */
export const openAsync = (list: AsyncChallengeView[], now = Date.now()) => list.filter((c) => c.replyScore === null && c.expiresAt > now);

export const pendingCount = (s: SocialState) => s.incoming.length + s.invites.length + openAsync(s.asyncIn).length;

export async function addFriend(handle: string): Promise<'pending' | 'accepted'> {
  await ensureRegistered();
  const { status } = await api<{ status: 'pending' | 'accepted' }>('POST', '/me/friends', { handle });
  void useSocial.getState().refresh();
  return status;
}

export async function removeFriend(handle: string) {
  await ensureRegistered();
  await api('DELETE', `/me/friends/${encodeURIComponent(handle)}`);
  void useSocial.getState().refresh();
}

/** Challenge a friend to a private 1v1 (scoring: the chosen duel mode unless given). Returns the room code to open. */
export async function challenge(handle: string, gameId?: string | null, mode: ScoreMode = useSocial.getState().duelMode): Promise<string> {
  await ensureRegistered();
  // No game chosen: pick one now, so the invite says what you'll play and the room can start right away.
  const { code } = await api<{ code: string }>('POST', '/me/challenge', { handle, gameId: gameId ?? randomPoolGame(), mode });
  return code;
}

export async function answerInvite(inv: InviteView, accept: boolean) {
  useSocial.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== inv.id), invites: s.invites.filter((t) => t.id !== inv.id) }));
  await api('POST', `/me/invites/${inv.id}`, { action: accept ? 'accept' : 'decline' }).catch(() => {});
}

// ---------- async challenges ("Beat my score") ----------

/** Send a finished run to a friend: they replay the identical game (same seed and start level) within 24 h. */
export async function sendAsyncChallenge(handle: string, run: { gameId: string; seed: number; startLevel: number; score: number }): Promise<AsyncChallengeView> {
  await ensureRegistered();
  const { challenge: c } = await api<{ challenge: AsyncChallengeView }>('POST', '/me/async', { handle, ...run });
  useSocial.setState((s) => ({ asyncOut: [c, ...s.asyncOut.filter((x) => x.id !== c.id)] }));
  return c;
}

/**
 * Submit my score for a challenge. Only the first try counts: a repeat returns the stored result
 * with `first: false`. Throws if the challenge has expired or doesn't exist.
 */
export async function replyAsyncChallenge(id: string, score: number): Promise<{ challenge: AsyncChallengeView; first: boolean }> {
  await ensureRegistered();
  let c: AsyncChallengeView;
  let first = true;
  try {
    c = (await api<{ challenge: AsyncChallengeView }>('POST', `/me/async/${id}/reply`, { score })).challenge;
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 409) throw e;
    // Already answered: fetch the stored result.
    await useSocial.getState().refresh();
    const known = useSocial.getState().asyncIn.find((x) => x.id === id);
    if (!known) throw e;
    c = known;
    first = false;
  }
  useSocial.setState((s) => ({ asyncIn: s.asyncIn.map((x) => (x.id === c.id ? c : x)) }));
  return { challenge: c, first };
}

/** Where to play a challenge: the play route with the challenge's seed and start level. */
export const asyncPlayPath = (c: Pick<AsyncChallengeView, 'id' | 'gameId' | 'seed' | 'startLevel'>) =>
  `/play/${c.gameId}?ch=${encodeURIComponent(c.id)}&seed=${c.seed >>> 0}&lv=${c.startLevel}`;

/** Read a challenge back from the play route's query string. */
export function parseAsyncPlay(search: string): { id: string; seed: number; startLevel: number } | null {
  const q = new URLSearchParams(search);
  const id = q.get('ch');
  const seed = Number(q.get('seed'));
  const startLevel = Number(q.get('lv') ?? 1);
  if (!id || !/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(seed) || seed < 0 || !Number.isInteger(startLevel) || startLevel < 1) return null;
  return { id, seed, startLevel };
}

/**
 * The game that's open right now: what it was seeded with, so a finished run can be sent as a challenge,
 * and (when it is a reply) which challenge it answers. Set by the play overlay when it starts a run.
 */
export interface RunInfo {
  gameId: string;
  seed: number;
  startLevel: number;
  /** Daily runs use the daily variant of some games, so they can't be replayed as a challenge. */
  daily: boolean;
  /** Increments every run, so a results screen can tell runs apart. */
  run: number;
  replyTo: string | null;
}
export const useLastRun = create<{ run: RunInfo | null }>(() => ({ run: null }));
let runCounter = 0;
export function noteRun(r: Omit<RunInfo, 'run'>) {
  useLastRun.setState({ run: { ...r, run: ++runCounter } });
}

/** Called by the lobby connection. */
export function onInvite(invite: InviteView) {
  useSocial.setState((s) => ({ toasts: [...s.toasts.filter((t) => t.id !== invite.id), invite], invites: [invite, ...s.invites.filter((t) => t.id !== invite.id)] }));
}

// Keep the server's copy of the orb skin current so opponents see the right one.
useEconomy.subscribe((s, prev) => {
  if (s.equipped.skin !== prev.equipped.skin && useSocial.getState().signedIn) void updateMe({ skin: s.equipped.skin }).catch(() => {});
});
