// Accounts and cloud sync.
//
// Every device starts as a guest (an anonymous player with a device key). Creating an account adds a password
// (and optionally Google) to that same player, so nothing is lost. Logging in on another device gives that device
// its own key for the account and pulls the cloud save; from then on progress syncs both ways.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';
import { useProfile } from './profile';
import { useProgress } from './progress';
import { useEconomy } from './economy';
import { useSettings } from './settings';
import { api, ApiError, ensureRegistered, resetSession, setAccountListener, useSocial } from './social';
import { useVersusLive } from './versus/live';
import { useMatch } from './versus/match';
import { SAVE_SCHEMA, hasProgress, mergeSaves, type SaveDoc } from './saveMerge';
import type { PublicProfile } from './versus/protocol';

export interface AccountInfo {
  hasPassword: boolean;
  /** Linked Google email, or null. */
  google: string | null;
}

interface AccountState {
  account: AccountInfo | null;
  /** Cloud save version this device last synced with (0 = never). */
  baseVersion: number;
  /** Local changes not yet uploaded. */
  dirty: boolean;
  status: 'idle' | 'syncing' | 'synced' | 'error';
  lastSynced: number;
}

export const useAccount = create<AccountState>()(
  persist(() => ({ account: null, baseVersion: 0, dirty: false, status: 'idle', lastSynced: 0 }) as AccountState, {
    name: 'utopia.account',
    storage: safeJSONStorage(),
    partialize: (s) => ({ account: s.account, baseVersion: s.baseVersion, dirty: s.dirty, lastSynced: s.lastSynced }) as AccountState,
  }),
);

export const isSignedUp = (a: AccountInfo | null) => !!a && (a.hasPassword || !!a.google);

// The server tells us the account state whenever this device signs in.
setAccountListener((a) => useAccount.setState({ account: a }));

// ---------- snapshot / apply ----------
const plain = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'function'));
const DEVICE_SETTINGS = new Set(['graphics', 'calibrationMs', 'feedSound', 'previewStyle']);

export function snapshot(): SaveDoc {
  const p = useProgress.getState();
  const e = useEconomy.getState();
  return {
    schema: SAVE_SCHEMA,
    savedAt: Date.now(),
    progress: { games: p.games, history: p.history },
    economy: { orbs: e.orbs, xp: e.xp, owned: e.owned, sampled: e.sampled, equipped: e.equipped, boosts: e.boosts, quests: e.quests, ads: e.ads } as SaveDoc['economy'],
    settings: Object.fromEntries(Object.entries(plain(useSettings.getState())).filter(([k]) => !DEVICE_SETTINGS.has(k))),
  };
}

let applying = false;
function apply(d: SaveDoc) {
  applying = true;
  try {
    useProgress.setState({ games: d.progress.games ?? {}, history: d.progress.history ?? [] });
    useEconomy.setState(d.economy as never);
    const known = Object.keys(plain(useSettings.getState()));
    useSettings.getState().set(Object.fromEntries(Object.entries(d.settings ?? {}).filter(([k]) => known.includes(k) && !DEVICE_SETTINGS.has(k))));
  } finally {
    applying = false;
  }
}

// ---------- sync ----------
interface RemoteSave {
  data: SaveDoc;
  version: number;
  updatedAt: number;
}
let syncing: Promise<void> | null = null;
let timer = 0;

/** Pull → (replace | merge) → push. Safe to call any time; only runs for signed-up players. */
export function syncNow(): Promise<void> {
  if (syncing) return syncing;
  if (!isSignedUp(useAccount.getState().account)) return Promise.resolve();
  syncing = (async () => {
    useAccount.setState({ status: 'syncing' });
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { save } = await api<{ save: RemoteSave | null }>('GET', '/me/save');
        const st = useAccount.getState();
        let doc: SaveDoc | null = null;
        if (save && save.version !== st.baseVersion) {
          // The cloud moved on. Untouched here → take it as is; changed on both sides → merge.
          if (st.dirty) doc = mergeSaves(snapshot(), save.data);
          else {
            apply(save.data);
            useAccount.setState({ baseVersion: save.version, dirty: false, status: 'synced', lastSynced: Date.now() });
            return;
          }
        } else if (st.dirty || !save) doc = snapshot();
        if (!doc) {
          useAccount.setState({ status: 'synced', lastSynced: Date.now() });
          return;
        }
        if (save && save.version !== st.baseVersion) apply(doc); // show the merged result right away
        try {
          const { version } = await api<{ version: number }>('PUT', '/me/save', { data: doc, baseVersion: save?.version ?? 0 });
          useAccount.setState({ baseVersion: version, dirty: false, status: 'synced', lastSynced: Date.now() });
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) continue; // someone else saved in between: go round again
          throw e;
        }
      }
    } catch (e) {
      console.warn('[sync]', e);
      useAccount.setState({ status: 'error' });
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

function markDirty() {
  if (applying) return;
  if (!useAccount.getState().dirty) useAccount.setState({ dirty: true });
  if (!isSignedUp(useAccount.getState().account)) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), 4000);
}

/** Start watching the stores and keep the cloud copy current. Call once at app start. */
export function startSync() {
  useProgress.subscribe(markDirty);
  useEconomy.subscribe(markDirty);
  useSettings.subscribe(markDirty);
  // Final push when the tab goes away (keepalive so it survives navigation/close).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return void syncNow();
    const st = useAccount.getState();
    if (!st.dirty || !isSignedUp(st.account)) return;
    void syncNow();
  });
  window.setInterval(() => void syncNow(), 90_000);
  void ensureRegistered().then(() => syncNow());
}

// ---------- actions ----------
export function setAccount(a: AccountInfo | null | undefined) {
  if (a) useAccount.setState({ account: a });
}

/** Turn this device's guest player into an account (same player: rating, friends and progress stay). */
export async function createAccount(handle: string, password: string) {
  await ensureRegistered();
  const r = await api<{ me: PublicProfile; account: AccountInfo }>('POST', '/auth/register', { handle, password });
  useProfile.setState({ handle: r.me.handle, named: true });
  useSocial.setState({ me: r.me });
  useAccount.setState({ account: r.account, dirty: true });
  await syncNow();
}

/** Become the account's player on this device, then bring progress across. */
async function adopt(r: { pid: string; key: string; me: PublicProfile; account: AccountInfo }) {
  const hadGuestProgress = hasProgress(snapshot());
  useMatch.getState().leave();
  useProfile.setState({ id: r.pid, key: r.key, handle: r.me.handle, name: r.me.name, named: true });
  resetSession();
  // baseVersion 0 + dirty = merge this device's guest progress into the account; otherwise just take the cloud copy.
  useAccount.setState({ account: r.account, baseVersion: 0, dirty: hadGuestProgress, status: 'idle' });
  if (r.me.skin) useEconomy.setState((e) => ({ equipped: { ...e.equipped, skin: r.me.skin } }));
  await ensureRegistered(true);
  await syncNow();
  void useSocial.getState().refresh();
  useVersusLive.getState().reconnect();
}

export async function login(handle: string, password: string) {
  const r = await api<{ pid: string; key: string; me: PublicProfile; account: AccountInfo }>('POST', '/auth/login', { handle, password });
  await adopt(r);
}

export async function googleLogin(credential: string) {
  const r = await api<{ pid: string; key: string; me: PublicProfile; account: AccountInfo }>('POST', '/auth/google', { credential, mode: 'login' });
  await adopt(r);
}

export async function linkGoogle(credential: string) {
  await ensureRegistered();
  const r = await api<{ account: AccountInfo }>('POST', '/auth/google', { credential, mode: 'link' });
  useAccount.setState({ account: r.account, dirty: true });
  await syncNow();
}

export async function unlinkGoogle() {
  const r = await api<{ account: AccountInfo }>('POST', '/auth/google/unlink', {});
  useAccount.setState({ account: r.account });
}

export async function changePassword(current: string, next: string) {
  const r = await api<{ account: AccountInfo }>('POST', '/auth/password', { current, next });
  useAccount.setState({ account: r.account });
}

/** Upload everything, forget this device's key, and start fresh as a new guest. */
export async function logout() {
  await syncNow().catch(() => {});
  await api('POST', '/auth/logout', {}).catch(() => {});
  useMatch.getState().leave();
  useProgress.getState().clearAll();
  useEconomy.getState().reset();
  const fresh = useProfile.getInitialState?.() ?? null;
  const rand = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
  useProfile.setState({ id: rand(20), key: rand(40), handle: null, named: false, ...(fresh ? { name: fresh.name } : {}) });
  useAccount.setState({ account: null, baseVersion: 0, dirty: false, status: 'idle', lastSynced: 0 });
  useSocial.setState({ friends: [], incoming: [], outgoing: [], invites: [], toasts: [], loaded: false, me: null, signedIn: false });
  resetSession();
  await ensureRegistered(true);
  useVersusLive.getState().reconnect();
}
