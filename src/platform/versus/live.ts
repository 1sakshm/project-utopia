// Lobby connection: who's online, live matches, the leaderboard, your record and quick-match queueing.
// The socket is ref-counted: screens that show live data call `retain()`; it closes a little after the last one
// lets go (unless you're queueing), and reconnects with backoff while needed.
import { create } from 'zustand';
import { useProfile } from '../profile';
import { useSettings } from '../settings';
import { track } from '../analytics';
import { VERSUS_WS, randomPoolGame } from './config';
import type { LeaderRow, LobbyIn, LobbyOut, MatchSummary, Record_ } from './protocol';

export type LiveStatus = 'unconfigured' | 'idle' | 'connecting' | 'online' | 'offline';

interface LiveState {
  status: LiveStatus;
  online: number;
  matches: MatchSummary[];
  leaders: LeaderRow[];
  me: Record_ | null;
  queue: null | { gameId: string | null; since: number; waiting: number };
  /** A quick match was found and hasn't been opened yet. */
  found: null | { code: string; gameId: string };
  retain: () => () => void;
  queueFor: (gameId: string | null) => void;
  cancelQueue: () => void;
  consumeFound: () => void;
  reconnect: () => void;
}

let ws: WebSocket | null = null;
let refs = 0;
let closeTimer = 0;
let retryTimer = 0;
let pingTimer = 0;
let backoff = 1000;

const needed = () => refs > 0 || !!useVersusLive.getState().queue;

function send(m: LobbyIn) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function hello() {
  const p = useProfile.getState();
  send({ t: 'hello', pid: p.id, name: p.name });
}

function connect() {
  if (!VERSUS_WS || ws) return;
  window.clearTimeout(retryTimer);
  useVersusLive.setState({ status: 'connecting' });
  const sock = new WebSocket(`${VERSUS_WS}/lobby`);
  ws = sock;
  sock.onopen = () => {
    backoff = 1000;
    hello();
    const q = useVersusLive.getState().queue;
    if (q) send({ t: 'queue', gameId: q.gameId, fallback: randomPoolGame(), relaxed: useSettings.getState().timing !== 'standard' });
    pingTimer = window.setInterval(() => send({ t: 'ping' }), 25_000);
  };
  sock.onmessage = (e) => {
    let m: LobbyOut;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    const set = useVersusLive.setState;
    switch (m.t) {
      case 'snapshot':
        set({ status: 'online', online: m.online, matches: m.matches, leaders: m.leaders, me: m.me });
        break;
      case 'matches':
        set({ matches: m.matches });
        break;
      case 'online':
        set({ online: m.online });
        break;
      case 'leaders':
        set(m.me ? { leaders: m.leaders, me: m.me } : { leaders: m.leaders });
        break;
      case 'queued':
        set((s) => ({ queue: s.queue ? { ...s.queue, waiting: m.waiting } : s.queue }));
        break;
      case 'matched': {
        const q = useVersusLive.getState().queue;
        track({ name: 'versus', action: 'matched', wait_ms: q ? Date.now() - q.since : 0 });
        set({ queue: null, found: { code: m.code, gameId: m.gameId } });
        break;
      }
    }
  };
  sock.onclose = () => {
    window.clearInterval(pingTimer);
    if (ws === sock) ws = null;
    if (needed()) {
      useVersusLive.setState({ status: 'offline' });
      retryTimer = window.setTimeout(connect, backoff);
      backoff = Math.min(15_000, backoff * 2);
    } else useVersusLive.setState({ status: 'idle' });
  };
}

function disconnect() {
  window.clearTimeout(retryTimer);
  window.clearInterval(pingTimer);
  const s = ws;
  ws = null;
  s?.close();
  useVersusLive.setState({ status: VERSUS_WS ? 'idle' : 'unconfigured' });
}

export const useVersusLive = create<LiveState>((set, get) => ({
  status: VERSUS_WS ? 'idle' : 'unconfigured',
  online: 0,
  matches: [],
  leaders: [],
  me: null,
  queue: null,
  found: null,
  retain: () => {
    refs++;
    window.clearTimeout(closeTimer);
    connect();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      refs--;
      if (!needed()) closeTimer = window.setTimeout(() => !needed() && disconnect(), 20_000);
    };
  },
  queueFor: (gameId) => {
    set({ queue: { gameId, since: Date.now(), waiting: 0 }, found: null });
    track({ name: 'versus', action: 'queue', game_id: gameId ?? 'any' });
    if (ws?.readyState === WebSocket.OPEN) send({ t: 'queue', gameId, fallback: randomPoolGame(), relaxed: useSettings.getState().timing !== 'standard' });
    else connect();
  },
  cancelQueue: () => {
    if (!get().queue) return;
    send({ t: 'cancel' });
    set({ queue: null });
  },
  consumeFound: () => set({ found: null }),
  reconnect: () => {
    backoff = 1000;
    disconnect();
    connect();
  },
}));

// A new display name is announced right away.
useProfile.subscribe((p, prev) => {
  if (p.name !== prev.name) hello();
});
