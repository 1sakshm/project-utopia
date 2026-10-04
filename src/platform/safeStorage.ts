// A localStorage wrapper for persisted stores that never throws:
//  - blocked storage (private mode, disabled cookies) → falls back to memory for this visit and tells the UI
//  - quota errors on write → keeps the in-memory copy and tells the UI
//  - corrupted JSON on read → backs the bad value up under "<key>.corrupt" and starts clean
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const memory = new Map<string, string>();
let healthy = true;
const listeners = new Set<(ok: boolean) => void>();
const flag = (ok: boolean) => {
  if (ok === healthy) return;
  healthy = ok;
  listeners.forEach((l) => l(ok));
};
export const storageHealthy = () => healthy;
export function onStorageHealth(fn: (ok: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const raw: StateStorage = {
  getItem(name) {
    try {
      const v = localStorage.getItem(name);
      if (v != null) {
        try {
          JSON.parse(v);
        } catch {
          localStorage.setItem(`${name}.corrupt`, v);
          localStorage.removeItem(name);
          return null;
        }
      }
      return v ?? memory.get(name) ?? null;
    } catch {
      flag(false);
      return memory.get(name) ?? null;
    }
  },
  setItem(name, value) {
    memory.set(name, value);
    try {
      localStorage.setItem(name, value);
      flag(true);
    } catch {
      flag(false);
    }
  },
  removeItem(name) {
    memory.delete(name);
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

/** Drop-in `storage` option for zustand `persist`. */
export const safeJSONStorage = () => createJSONStorage(() => raw);
