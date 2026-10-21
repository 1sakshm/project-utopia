// Wire protocol shared by the app and the match server (server/src). Plain JSON over WebSocket.
// Keep this file dependency-free: the Cloudflare Worker bundles it directly.

export type RoomKind = 'duel' | 'party';
export type RoomState = 'lobby' | 'countdown' | 'playing' | 'done';
/**
 * How a room decides the winner.
 *  standard: highest raw score wins (quick matches are always standard and ranked).
 *  friendly: each score is measured against that player's own personal best on the game (see relativeScore),
 *            so a newcomer can beat a veteran. Friendly rounds never change ratings.
 */
export type ScoreMode = 'standard' | 'friendly';
export const isScoreMode = (v: unknown): v is ScoreMode => v === 'standard' || v === 'friendly';

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
  /** Friendly rooms: the player's personal best on this game before the round (0 = never played it). */
  best?: number;
  /** Friendly rooms: this round's score as a percent of `best` (see relativeScore). */
  rel?: number;
}

export interface RoomView {
  code: string;
  kind: RoomKind;
  ranked: boolean;
  public: boolean;
  host: string;
  gameId: string | null;
  /** Scoring rule (older servers omit it: standard). */
  mode?: ScoreMode;
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
  mode?: ScoreMode;
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
  mode?: ScoreMode;
  createdAt: number;
  from: { handle: string; name: string; skin: string };
}

/** "Beat my score": an async challenge to replay the exact same game (same seed, same start level) within 24 h. */
export interface AsyncChallengeView {
  id: string;
  gameId: string;
  seed: number;
  startLevel: number;
  /** The challenger's score to beat. */
  score: number;
  createdAt: number;
  expiresAt: number;
  replyScore: number | null;
  repliedAt: number | null;
  from: { handle: string; name: string; skin: string };
  to: { handle: string; name: string; skin: string };
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
  /** `gap`: the rating gap currently accepted for your match (null = anyone). */
  | { t: 'queued'; since: number; waiting: number; gap?: number | null }
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
  /** `b`: the player's personal best on this game before the round (used by friendly rooms). */
  | { t: 'score'; s: number; l: number; b?: number }
  | { t: 'done'; s: number; l: number; b?: number }
  | { t: 'emote'; e: Emote }
  | { t: 'rematch' }
  /** Host only. `mode` can be changed in unranked rooms between rounds. */
  | { t: 'settings'; public?: boolean; mode?: ScoreMode }
  | { t: 'leave' };

// ---------- match → client ----------
export type MatchOut =
  | { t: 'room'; room: RoomView; now: number; you: string | null }
  | { t: 'score'; pid: string; s: number; l: number; b?: number }
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

/**
 * Friendly scoring: a score as a percent of the player's own personal best (one decimal, capped at 999.9).
 * Someone who has never played the game (best 0) has no baseline yet, so a scoring run counts as 100%.
 * Scoring nothing is always 0%.
 */
export function relativeScore(score: number, best: number | undefined): number {
  const s = Math.max(0, Number(score) || 0);
  const b = Math.max(0, Number(best) || 0);
  if (s <= 0) return 0;
  if (b <= 0) return 100;
  return Math.min(999.9, Math.round((s / b) * 1000) / 10);
}

/** What decides the order in a room: raw score, or percent of own best in friendly rooms. */
export const rankValue = (mode: ScoreMode | undefined, p: { score: number; best?: number }) => (mode === 'friendly' ? relativeScore(p.score, p.best) : p.score);

/** Async challenges stay open this long. */
export const ASYNC_TTL_MS = 24 * 3600_000;

/** Result of an async challenge from the replier's side. */
export function asyncOutcome(challengeScore: number, replyScore: number): 'won' | 'lost' | 'draw' {
  return replyScore > challengeScore ? 'won' : replyScore < challengeScore ? 'lost' : 'draw';
}
