// Wire protocol shared by the app and the match server (server/src). Plain JSON over WebSocket.
// Keep this file dependency-free: the Cloudflare Worker bundles it directly.

export type RoomKind = 'duel' | 'party';
export type RoomState = 'lobby' | 'countdown' | 'playing' | 'done';

export interface PlayerView {
  pid: string;
  name: string;
  /** @handle (without the @). */
  handle?: string;
  /** Equipped orb skin id, so opponents see your real orb. */
  skin?: string;
  rating: number;
  ready: boolean;
  connected: boolean;
  score: number;
  level: number;
  done: boolean;
  /** Player uses relaxed timing (accessibility). Shown next to their name; never hidden. */
  relaxed: boolean;
  /** Final placing (1 = first) once the room is done. */
  place?: number;
  /** Rating change from this match (ranked duels only). */
  delta?: number;
}

export interface RoomView {
  code: string;
  kind: RoomKind;
  ranked: boolean;
  public: boolean;
  host: string;
  gameId: string | null;
  seed: number;
  state: RoomState;
  /** Server epoch ms when play starts (countdown) / must end (playing). */
  startAt: number;
  endsAt: number;
  max: number;
  players: PlayerView[];
  spectators: number;
  /** Increments on every rematch so clients can tell rounds apart. */
  round: number;
}

/** Compact summary the lobby shows in "Live now". */
export interface MatchSummary {
  code: string;
  kind: RoomKind;
  ranked: boolean;
  public: boolean;
  gameId: string | null;
  state: RoomState;
  players: Array<{ name: string; score: number; done: boolean; rating: number }>;
  max: number;
  spectators: number;
  updatedAt: number;
}

export interface LeaderRow {
  name: string;
  handle?: string;
  skin?: string;
  rating: number;
  w: number;
  l: number;
  d: number;
}

export interface Record_ {
  rating: number;
  w: number;
  l: number;
  d: number;
}

export interface GhostRun {
  name: string;
  score: number;
  /** [ms since start, score] samples. */
  timeline: Array<[number, number]>;
}

/** What anyone can see about a player. */
export interface PublicProfile {
  handle: string;
  name: string;
  skin: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  createdAt: number;
}

export interface FriendView extends PublicProfile {
  online: boolean;
  lastSeen: number;
  since: number;
}

/** A friend's challenge to a private duel. */
export interface InviteView {
  id: string;
  code: string;
  gameId: string | null;
  createdAt: number;
  from: { handle: string; name: string; skin: string };
}

// ---------- client → lobby ----------
export type LobbyIn =
  | { t: 'hello'; pid: string; key: string; name: string }
  | { t: 'queue'; gameId: string | null; fallback: string; relaxed: boolean }
  | { t: 'cancel' }
  | { t: 'ping' };

// ---------- lobby → client ----------
export type LobbyOut =
  | { t: 'snapshot'; online: number; matches: MatchSummary[]; leaders: LeaderRow[]; me: Record_ }
  | { t: 'matches'; matches: MatchSummary[] }
  | { t: 'online'; online: number }
  | { t: 'leaders'; leaders: LeaderRow[]; me?: Record_ }
  | { t: 'queued'; since: number; waiting: number }
  | { t: 'matched'; code: string; gameId: string }
  | { t: 'pong'; now: number }
  /** A friend challenged you. */
  | { t: 'invite'; invite: InviteView }
  /** Something changed in your friends list (request, accept, someone came online): refetch. */
  | { t: 'social' }
  | { t: 'error'; msg: string; auth?: boolean };

// ---------- client → match ----------
export type MatchIn =
  | { t: 'hello'; pid: string; key: string; name: string; spectate?: boolean; relaxed?: boolean }
  | { t: 'ready'; ready: boolean }
  | { t: 'pick'; gameId: string }
  | { t: 'start' }
  | { t: 'score'; s: number; l: number }
  | { t: 'done'; s: number; l: number }
  | { t: 'emote'; e: Emote }
  | { t: 'rematch' }
  | { t: 'settings'; public: boolean }
  | { t: 'leave' };

// ---------- match → client ----------
export type MatchOut =
  | { t: 'room'; room: RoomView; now: number; you: string | null }
  | { t: 'score'; pid: string; s: number; l: number }
  | { t: 'emote'; pid: string; e: Emote }
  | { t: 'error'; msg: string; fatal?: boolean };

export const EMOTES = ['gg', 'fire', 'wow', 'lol', 'wave'] as const;
export type Emote = (typeof EMOTES)[number];
export const EMOTE_LABEL: Record<Emote, string> = { gg: 'GG', fire: '🔥', wow: '😮', lol: '😂', wave: '👋' };

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
export const isRoomCode = (s: string) => new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(s);

/** Countdown before a round starts, and the hard cap on a round (games normally end well before). */
export const COUNTDOWN_MS = 4000;
/** Every versus round is exactly one minute. */
export const ROUND_MS = 60_000;
/** Late 'done' messages still count for this long after the clock runs out. */
export const ROUND_GRACE_MS = 1500;
/** @deprecated kept for old imports: rounds are now ROUND_MS. */
export const ROUND_CAP_MS = ROUND_MS;
export const PARTY_MAX = 8;
export const START_RATING = 1000;

/** Standard Elo. `score` is 1 for a win, 0.5 for a draw, 0 for a loss. */
export function elo(ra: number, rb: number, score: number, k = 32): number {
  const expected = 1 / (1 + 10 ** ((rb - ra) / 400));
  return Math.round(k * (score - expected));
}
