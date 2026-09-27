import { create } from 'zustand';

interface RouteState {
  path: string;
  search: string;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const current = () => ({ path: window.location.pathname, search: window.location.search });

export const useRoute = create<RouteState>((set) => ({
  ...current(),
  navigate: (to, opts) => {
    if (to === window.location.pathname + window.location.search) return;
    if (opts?.replace) history.replaceState(null, '', to);
    else history.pushState(null, '', to);
    set(current());
  },
}));

window.addEventListener('popstate', () => useRoute.setState(current()));

export const navigate = (to: string, opts?: { replace?: boolean }) => useRoute.getState().navigate(to, opts);

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
