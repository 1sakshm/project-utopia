import { create } from 'zustand';
import { get as idbGet, set as idbSet } from 'idb-keyval';

/** Poster frames captured from live previews, cached in memory + IndexedDB. */
interface PosterState {
  posters: Record<string, string>;
  put: (id: string, url: string) => void;
}

export const usePosters = create<PosterState>((set) => ({
  posters: {},
  put: (id, url) => {
    set((s) => ({ posters: { ...s.posters, [id]: url } }));
    void idbSet(`poster:${id}`, url).catch(() => {});
  },
}));

export async function loadPosters(ids: string[]) {
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const v = await idbGet<string>(`poster:${id}`);
        return v ? ([id, v] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  const found = Object.fromEntries(entries.filter((e): e is readonly [string, string] => !!e));
  usePosters.setState((s) => ({ posters: { ...found, ...s.posters } }));
}
