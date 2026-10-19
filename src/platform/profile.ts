// Anonymous player identity: a random device id and a display name. No account, no email. The id is what the
// match server uses to keep a rating; the name is what opponents see.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';

const ADJ = ['Swift', 'Quiet', 'Bright', 'Lucky', 'Clever', 'Calm', 'Brave', 'Sunny', 'Keen', 'Nimble', 'Steady', 'Bold'];
const NOUN = ['Otter', 'Falcon', 'Fox', 'Heron', 'Lynx', 'Panda', 'Koi', 'Wren', 'Orca', 'Moth', 'Hare', 'Owl'];

export const randomName = () => `${ADJ[(Math.random() * ADJ.length) | 0]} ${NOUN[(Math.random() * NOUN.length) | 0]}`;

const uid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 20);

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
  name: string;
  /** Has the player chosen a name (or accepted the suggestion)? */
  named: boolean;
  setName: (n: string) => boolean;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      id: uid(),
      name: randomName(),
      named: false,
      setName: (n) => {
        const name = cleanName(n);
        if (name.length < 2) return false;
        set({ name, named: true });
        return true;
      },
    }),
    { name: 'utopia.profile', storage: safeJSONStorage() },
  ),
);

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
