// One match connection at a time: a real room on the server, or a local "ghost" race against a recorded run.
// Both expose the same RoomView, so the UI doesn't care which one it's showing.
import { create } from 'zustand';
import { useProfile } from '../profile';
import { useSettings } from '../settings';
import { useProgress } from '../progress';
import { track } from '../analytics';
import { ensureRegistered } from '../social';
import { useEconomy } from '../economy';
import { VERSUS_HTTP, VERSUS_WS } from './config';
import { COUNTDOWN_MS, ROUND_MS, type Emote, type GhostRun, type MatchIn, type MatchOut, type PlayerView, type RoomView } from './protocol';

export type MatchStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface EmoteEvent {
  id: number;
  pid: string;
  e: Emote;
}

interface MatchState {
  code: string | null;
  status: MatchStatus;
  error: string | null;
  room: RoomView | null;
  you: string | null;
  /** serverNow - Date.now(), to show countdowns on the server's clock. */
  offset: number;
  emotes: EmoteEvent[];
  ghost: boolean;
  join: (code: string, opts?: { spectate?: boolean }) => void;
  leave: () => void;
  /** Leave on the next tick unless something re-joins first (survives React remounts). */
  leaveSoon: () => void;
  send: (m: MatchIn) => void;
  /** Race a recorded run locally (no server round-trip during play). */
  startGhost: (gameId: string, run: GhostRun, round?: number) => void;
}

let ws: WebSocket | null = null;
let retry = 0;
let attempts = 0;
let emoteId = 0;
let lastScoreSent = 0;
let pendingScore: { s: number; l: number } | null = null;
let scoreTimer = 0;
let ghostTimer = 0;
let ghostRun: GhostRun | null = null;
let leaveTimer = 0;

const GHOST_PID = 'ghost';

export const useMatch = create<MatchState>((set, get) => ({
  code: null,
  status: 'idle',
  error: null,
  room: null,
  you: null,
  offset: 0,
  emotes: [],
  ghost: false,

  join: (code, opts) => {
    window.clearTimeout(leaveTimer);
    if (get().code === code && (ws || get().ghost)) return;
    if (code === 'GHOST') return; // ghost races are started with startGhost()
    get().leave();
    set({ code, status: 'connecting', error: null, room: null, you: null, emotes: [], ghost: false });
    attempts = 0;
    void ensureRegistered().then(() => useMatch.getState().code === code && open(code, !!opts?.spectate));
    track({ name: 'versus', action: opts?.spectate ? 'watch' : 'join' });
  },

  leaveSoon: () => {
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => useMatch.getState().leave(), 50);
  },

  leave: () => {
    window.clearTimeout(leaveTimer);
    window.clearTimeout(retry);
    window.clearInterval(ghostTimer);
    window.clearTimeout(scoreTimer);
    ghostRun = null;
    const s = ws;
    ws = null;
    if (s?.readyState === WebSocket.OPEN) s.send(JSON.stringify({ t: 'leave' } satisfies MatchIn));
    s?.close();
    set({ code: null, status: 'idle', room: null, you: null, emotes: [], ghost: false, error: null });
  },

  send: (m) => {
    if (get().ghost) return ghostInput(m);
    // Live scores are throttled to ~6/s; the final 'done' always goes out immediately.
    if (m.t === 'score') {
      pendingScore = { s: m.s, l: m.l };
      const wait = 160 - (Date.now() - lastScoreSent);
      if (wait <= 0) flushScore();
      else if (!scoreTimer) scoreTimer = window.setTimeout(flushScore, wait);
      // Show my own live score locally right away.
      patchPlayer(get().you, { score: m.s, level: m.l });
      return;
    }
    if (m.t === 'done') {
      window.clearTimeout(scoreTimer);
      scoreTimer = 0;
      pendingScore = null;
      patchPlayer(get().you, { score: m.s, level: m.l, done: true });
    }
    raw(m);
  },

  startGhost: (gameId, run, round = 0) => {
    get().leave();
    const p = useProfile.getState();
    ghostRun = run;
    const now = Date.now();
    const me: PlayerView = { pid: p.id, name: p.name, handle: p.handle ?? undefined, skin: useEconomy.getState().equipped.skin, rating: 0, ready: true, connected: true, score: 0, level: 0, done: false, relaxed: useSettings.getState().timing !== 'standard' };
    const ghost: PlayerView = { pid: GHOST_PID, name: run.name, skin: 'skin-classic', rating: 0, ready: true, connected: true, score: 0, level: 0, done: false, relaxed: false };
    set({
      code: 'GHOST',
      status: 'open',
      ghost: true,
      you: p.id,
      offset: 0,
      emotes: [],
      error: null,
      room: {
        code: 'GHOST',
        kind: 'duel',
        ranked: false,
        public: false,
        host: p.id,
        gameId,
        seed: (Math.random() * 2 ** 31) | 0,
        state: 'countdown',
        startAt: now + COUNTDOWN_MS,
        endsAt: now + COUNTDOWN_MS + ROUND_MS,
        max: 2,
        players: [me, ghost],
        spectators: 0,
        round,
      },
    });
    track({ name: 'versus', action: 'ghost', game_id: gameId });
    ghostTimer = window.setInterval(ghostTick, 200);
  },
}));

function raw(m: MatchIn) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function flushScore() {
  scoreTimer = 0;
  if (!pendingScore) return;
  raw({ t: 'score', ...pendingScore });
  pendingScore = null;
  lastScoreSent = Date.now();
}

function patchPlayer(pid: string | null, patch: Partial<PlayerView>) {
  const room = useMatch.getState().room;
  if (!room || !pid) return;
  useMatch.setState({ room: { ...room, players: room.players.map((p) => (p.pid === pid ? { ...p, ...patch } : p)) } });
}

function open(code: string, spectate: boolean) {
  if (!VERSUS_WS) {
    useMatch.setState({ status: 'closed', error: 'Multiplayer isn’t set up on this build.' });
    return;
  }
  const sock = new WebSocket(`${VERSUS_WS}/match/${code}`);
  ws = sock;
  sock.onopen = () => {
    attempts = 0;
    const p = useProfile.getState();
    sock.send(JSON.stringify({ t: 'hello', pid: p.id, key: p.key, name: p.name, spectate, relaxed: useSettings.getState().timing !== 'standard' } satisfies MatchIn));
  };
  sock.onmessage = (e) => {
    let m: MatchOut;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (ws !== sock) return;
    switch (m.t) {
      case 'room':
        useMatch.setState({ room: m.room, you: m.you, offset: m.now - Date.now(), status: 'open' });
        break;
      case 'score':
        patchPlayer(m.pid, { score: m.s, level: m.l });
        break;
      case 'emote': {
        const ev = { id: ++emoteId, pid: m.pid, e: m.e };
        useMatch.setState((s) => ({ emotes: [...s.emotes.slice(-6), ev] }));
        window.setTimeout(() => useMatch.setState((s) => ({ emotes: s.emotes.filter((x) => x.id !== ev.id) })), 2600);
        break;
      }
      case 'error':
        useMatch.setState({ error: m.msg, ...(m.fatal ? { status: 'closed' as const } : {}) });
        if (m.fatal) {
          ws = null;
          sock.close();
        }
        break;
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    const st = useMatch.getState();
    if (st.status === 'closed' || !st.code) return;
    // Reconnect: the server keeps our seat for 30s mid-round.
    attempts++;
    if (attempts > 6) {
      useMatch.setState({ status: 'closed', error: 'Lost connection to the match.' });
      return;
    }
    useMatch.setState({ status: 'reconnecting' });
    retry = window.setTimeout(() => useMatch.getState().code === code && open(code, spectate), Math.min(8000, 500 * 2 ** attempts));
  };
}

// ---------- ghost race (local) ----------
function ghostScoreAt(t: number): number {
  const tl = ghostRun?.timeline ?? [];
  let s = 0;
  for (const [ts, v] of tl) {
    if (ts > t) break;
    s = v;
  }
  return s;
}

function ghostTick() {
  const st = useMatch.getState();
  const room = st.room;
  if (!st.ghost || !room || !ghostRun) return;
  const now = Date.now();
  if (room.state === 'countdown' && now >= room.startAt) {
    useMatch.setState({ room: { ...room, state: 'playing' } });
    return;
  }
  if (room.state !== 'playing') return;
  const t = Math.min(now - room.startAt, ROUND_MS);
  const end = Math.min(ROUND_MS, ghostRun.timeline[ghostRun.timeline.length - 1]?.[0] ?? 0);
  const g = room.players.find((p) => p.pid === GHOST_PID)!;
  const s = t >= end ? ghostFinal() : ghostScoreAt(t);
  if (s !== g.score || (t >= end && !g.done)) patchPlayer(GHOST_PID, { score: s, done: t >= end });
  if (now >= room.endsAt) finishGhost();
}

function ghostInput(m: MatchIn) {
  const st = useMatch.getState();
  if (!st.room) return;
  if (m.t === 'score') patchPlayer(st.you, { score: m.s, level: m.l });
  else if (m.t === 'done') {
    patchPlayer(st.you, { score: m.s, level: m.l, done: true });
    finishGhost();
  } else if (m.t === 'rematch' && ghostRun) {
    useMatch.getState().startGhost(st.room.gameId!, ghostRun, st.room.round + 1);
  }
}

/** The ghost's score when the one-minute clock runs out (its whole run if it finished sooner). */
function ghostFinal(): number {
  if (!ghostRun) return 0;
  const last = ghostRun.timeline[ghostRun.timeline.length - 1]?.[0] ?? 0;
  return last <= ROUND_MS ? ghostRun.score : ghostScoreAt(ROUND_MS);
}

/** You finished: the ghost's run is known, so the result is immediate. */
function finishGhost() {
  window.clearInterval(ghostTimer);
  const room = useMatch.getState().room;
  if (!room || !ghostRun || room.state === 'done') return;
  const players = room.players.map((p) => (p.pid === GHOST_PID ? { ...p, score: ghostFinal(), done: true } : { ...p, done: true }));
  const [a, b] = players;
  for (const p of players) {
    const other = p === a ? b : a;
    p.place = p.score === other.score ? 1 : p.score > other.score ? 1 : 2;
  }
  useMatch.setState({ room: { ...room, state: 'done', players } });
}

// ---------- helpers ----------

/** Create a private duel or party room. Returns the code. */
export async function createRoom(kind: 'duel' | 'party', opts: { gameId?: string | null; public?: boolean } = {}): Promise<string> {
  if (!VERSUS_HTTP) throw new Error('Multiplayer isn’t set up on this build.');
  await ensureRegistered();
  const res = await fetch(`${VERSUS_HTTP}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Player-Key': useProfile.getState().key },
    body: JSON.stringify({ kind, pid: useProfile.getState().id, gameId: opts.gameId ?? null, public: !!opts.public }),
  });
  if (!res.ok) throw new Error('Couldn’t create a room. Try again.');
  const { code } = (await res.json()) as { code: string };
  track({ name: 'versus', action: 'create', kind });
  return code;
}

/**
 * A run to race when nobody is online: a recorded run from another player if the server has one,
 * else your own best recent run of that game (turned into an even-paced timeline).
 */
export async function findGhost(gameId: string): Promise<GhostRun | null> {
  if (VERSUS_HTTP) {
    try {
      const res = await fetch(`${VERSUS_HTTP}/ghost/${gameId}`, { signal: AbortSignal.timeout(4000) });
      const { ghost } = (await res.json()) as { ghost: GhostRun | null };
      if (ghost && ghost.score > 0) return ghost;
    } catch {
      /* offline: fall through */
    }
  }
  const runs = useProgress
    .getState()
    .history.filter((h) => h.gameId === gameId && !h.assisted && h.score > 0)
    .slice(0, 10)
    .sort((x, y) => y.score - x.score);
  const best = runs[0];
  if (!best) return null;
  const steps = 24;
  const timeline: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    timeline.push([Math.round(best.ms * k), Math.round(best.score * (k * 0.6 + k * k * 0.4))]);
  }
  return { name: 'Your best', score: best.score, timeline };
}

/** Server-clock countdown in whole seconds (null when not counting down). */
export function secondsUntil(at: number, offset: number): number {
  return Math.max(0, Math.ceil((at - (Date.now() + offset)) / 1000));
}
