// Player identity. No email or password: the device holds a public id and a secret key. The match server stores
// only a hash of the key, so nobody else can act as you even though your id appears in rooms. The server also gives
// every player a unique, shareable @handle.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';

const ADJ = ['Swift', 'Quiet', 'Bright', 'Lucky', 'Clever', 'Calm', 'Brave', 'Sunny', 'Keen', 'Nimble', 'Steady', 'Bold'];
const NOUN = ['Otter', 'Falcon', 'Fox', 'Heron', 'Lynx', 'Panda', 'Koi', 'Wren', 'Orca', 'Moth', 'Hare', 'Owl'];

export const randomName = () => `${ADJ[(Math.random() * ADJ.length) | 0]} ${NOUN[(Math.random() * NOUN.length) | 0]}`;

const rand = (n: number) =>
  [...crypto.getRandomValues(new Uint8Array(n))].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

/** Trim, collapse spaces, drop control chars; 2–20 visible characters. */
export function cleanName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

interface ProfileState {
  id: string;
  /** Secret. Never shown, never sent anywhere except our own match server. */
  key: string;
  name: string;
  /** Unique @handle (without the @), assigned by the server on first sign-in. */
  handle: string | null;
  /** Has the player chosen a name (or accepted the suggestion)? */
  named: boolean;
  setName: (n: string) => boolean;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      id: rand(20),
      key: rand(40),
      name: randomName(),
      handle: null,
      named: false,
      setName: (n) => {
        const name = cleanName(n);
        if (name.length < 2) return false;
        set({ name, named: true });
        return true;
      },
    }),
    {
      name: 'utopia.profile',
      storage: safeJSONStorage(),
      version: 1,
      // v1: players got a secret key (older saves had only an id).
      migrate: (persisted) => {
        const st = (persisted ?? {}) as Partial<ProfileState>;
        return { ...st, key: st.key ?? rand(40), handle: st.handle ?? null } as ProfileState;
      },
    },
  ),
);

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export const profileUrl = (handle: string) => `${location.origin}/@${handle}`;
