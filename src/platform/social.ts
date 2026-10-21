// Accounts-without-accounts: sign-in with the device key, @handles, profiles, friends and challenges.
import { create } from 'zustand';
import { useProfile } from './profile';
import { useEconomy } from './economy';
import { VERSUS_HTTP, randomPoolGame } from './versus/config';
import type { FriendView, InviteView, PublicProfile } from './versus/protocol';

export interface RecentMatch {
  gameId: string | null;
  kind: string;
  ranked: boolean;
  at: number;
  place: number;
  score: number;
  delta: number | null;
  players: Array<{ handle: string | null; score: number; place: number }>;
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
interface SocialState {
  signedIn: boolean;
  me: PublicProfile | null;
  friends: FriendView[];
  incoming: FriendView[];
  outgoing: FriendView[];
  invites: InviteView[];
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
  loaded: false,
  toasts: [],
  refresh: async () => {
    await ensureRegistered();
    try {
      const r = await api<{ friends: FriendView[]; incoming: FriendView[]; outgoing: FriendView[]; invites: InviteView[] }>('GET', '/me/friends');
      set({ ...r, loaded: true });
    } catch (e) {
      console.warn('[social] friends', e);
    }
  },
}));

export const pendingCount = (s: SocialState) => s.incoming.length + s.invites.length;

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

/** Challenge a friend to a private 1v1. Returns the room code to open. */
export async function challenge(handle: string, gameId?: string | null): Promise<string> {
  await ensureRegistered();
  // No game chosen: pick one now, so the invite says what you'll play and the room can start right away.
  const { code } = await api<{ code: string }>('POST', '/me/challenge', { handle, gameId: gameId ?? randomPoolGame() });
  return code;
}

export async function answerInvite(inv: InviteView, accept: boolean) {
  useSocial.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== inv.id), invites: s.invites.filter((t) => t.id !== inv.id) }));
  await api('POST', `/me/invites/${inv.id}`, { action: accept ? 'accept' : 'decline' }).catch(() => {});
}

/** Called by the lobby connection. */
export function onInvite(invite: InviteView) {
  useSocial.setState((s) => ({ toasts: [...s.toasts.filter((t) => t.id !== invite.id), invite], invites: [invite, ...s.invites.filter((t) => t.id !== invite.id)] }));
}

// Keep the server's copy of the orb skin current so opponents see the right one.
useEconomy.subscribe((s, prev) => {
  if (s.equipped.skin !== prev.equipped.skin && useSocial.getState().signedIn) void updateMe({ skin: s.equipped.skin }).catch(() => {});
});
