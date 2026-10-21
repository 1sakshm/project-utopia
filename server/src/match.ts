// Match: one Durable Object per room code. Runs the room state machine
//   lobby → countdown → playing → done (→ lobby again on rematch)
// and relays live scores. Everyone plays the same game with the same seed, so no per-game netcode is needed:
// the server only has to agree on *when* the round starts and *what* everyone scored.
import { DurableObject } from 'cloudflare:workers';
import {
  COUNTDOWN_MS,
  EMOTES,
  ROUND_GRACE_MS,
  ROUND_MS,
  isScoreMode,
  rankValue,
  relativeScore,
  type MatchIn,
  type MatchOut,
  type MatchSummary,
  type PlayerView,
  type RoomKind,
  type RoomView,
  type ScoreMode,
  type GhostRun,
} from '../../src/platform/versus/protocol';
import { lobbyOf, PID_RE, type Env } from './util';
import * as db from './db';
import { botIdentity, botLevel, botRating, botScore, FILL_END_MS, FILL_START_MS, isBot, makeBrain, type BotBrain } from './bots';

interface Att {
  pid: string;
  spectate: boolean;
  lastScore: number;
  lastEmote: number;
}

interface PState extends PlayerView {
  timeline: Array<[number, number]>;
  forfeit: boolean;
  leftAt: number;
  /** Bots only: how this bot scores this round (made once the humans' bests are known). */
  brain?: BotBrain;
}

interface Room extends Omit<RoomView, 'players' | 'spectators' | 'mode'> {
  mode: ScoreMode;
  players: PState[];
  /** Quick-match rooms only admit the two matched players. */
  expect: string[] | null;
  createdAt: number;
  touchedAt: number;
}

export interface InitOptions {
  code: string;
  kind: RoomKind;
  ranked: boolean;
  /** Friendly rooms are never ranked. Default standard. */
  mode?: ScoreMode;
  public: boolean;
  host: string;
  gameId: string | null;
  max: number;
  expect: string[] | null;
  /** Parties: fill empty seats with bots after a short wait. Default on for parties. */
  botFill?: boolean;
}

/** A dropped player gets this long to reconnect mid-round before it counts as a forfeit. */
const GRACE_MS = 30_000;
/** Empty rooms are cleaned up after this long. */
const IDLE_MS = 10 * 60_000;
const SCORE_MIN_INTERVAL = 90;
const TIMELINE_STEP_MS = 500;
const SUMMARY_INTERVAL = 1500;
/** Bots report a new score this often during a round. */
const BOT_TICK_MS = 700;

export class Match extends DurableObject<Env> {
  private room: Room | null = null;
  private loaded = false;
  private lastSummary = 0;
  private lastSave = 0;
  /** Ghost runs for this round's game (bots borrow their pacing). */
  private ghosts: GhostRun[] = [];

  private humans() {
    return this.room!.players.filter((p) => !isBot(p.pid));
  }

  private async getRoom(): Promise<Room | null> {
    if (!this.loaded) {
      this.room = (await this.ctx.storage.get<Room>('room')) ?? null;
      if (this.room && !this.room.mode) this.room.mode = 'standard';
      this.loaded = true;
    }
    return this.room;
  }

  private async save(force = true) {
    if (!this.room) return;
    const now = Date.now();
    if (!force && now - this.lastSave < 2000) return;
    this.lastSave = now;
    this.room.touchedAt = now;
    await this.ctx.storage.put('room', this.room);
  }

  // ---------- RPC ----------
  async init(o: InitOptions) {
    await this.getRoom();
    const now = Date.now();
    const mode: ScoreMode = isScoreMode(o.mode) ? o.mode : 'standard';
    this.room = {
      code: o.code,
      kind: o.kind,
      ranked: o.ranked && mode === 'standard',
      mode,
      public: o.public,
      host: o.host,
      gameId: o.gameId,
      seed: 0,
      state: 'lobby',
      startAt: 0,
      endsAt: 0,
      max: o.max,
      round: 0,
      players: [],
      expect: o.expect,
      botFill: o.kind === 'party' ? o.botFill !== false : false,
      createdAt: now,
      touchedAt: now,
    };
    await this.save();
    await this.ctx.storage.setAlarm(now + (this.room.botFill ? FILL_START_MS : IDLE_MS));
  }

  /** Lobby RPC: put bots in this room (quick match with nobody else around). */
  async addBots(n: number, rating: number) {
    const r = await this.getRoom();
    if (!r) return;
    for (let i = 0; i < n && r.players.length < r.max; i++) this.addBot(rating);
    await this.save();
    this.pushRoom();
  }

  private addBot(rating: number) {
    const r = this.room!;
    const b = botIdentity();
    if (r.expect) r.expect.push(b.pid);
    r.players.push({
      pid: b.pid,
      name: b.name,
      bot: true,
      rating: botRating(rating),
      ready: true,
      connected: true,
      score: 0,
      level: 0,
      done: false,
      relaxed: false,
      timeline: [],
      forfeit: false,
      leftAt: 0,
    });
  }

  private avgHumanRating() {
    const h = this.humans();
    return h.length ? h.reduce((n, p) => n + p.rating, 0) / h.length : 1000;
  }

  // ---------- sockets ----------
  async fetch(_req: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pid: '', spectate: true, lastScore: 0, lastEmote: 0 } satisfies Att);
    return new Response(null, { status: 101, webSocket: client });
  }

  private open(): WebSocket[] {
    return this.ctx.getWebSockets().filter((w) => w.readyState === WebSocket.OPEN);
  }

  private att(ws: WebSocket): Att {
    return (ws.deserializeAttachment() as Att | null) ?? { pid: '', spectate: true, lastScore: 0, lastEmote: 0 };
  }

  private send(ws: WebSocket, msg: MatchOut) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closing */
    }
  }

  private view(): RoomView {
    const r = this.room!;
    const spectators = this.open().filter((w) => {
      const a = this.att(w);
      return a.pid && a.spectate;
    }).length;
    return {
      code: r.code,
      kind: r.kind,
      ranked: r.ranked,
      public: r.public,
      host: r.host,
      gameId: r.gameId,
      mode: r.mode,
      botFill: r.botFill,
      seed: r.seed,
      state: r.state,
      startAt: r.startAt,
      endsAt: r.endsAt,
      max: r.max,
      round: r.round,
      spectators,
      players: r.players.map(({ timeline: _t, forfeit: _f, leftAt: _l, brain: _b, ...p }) => p),
    };
  }

  private pushRoom() {
    const room = this.view();
    const now = Date.now();
    for (const w of this.open()) {
      const a = this.att(w);
      if (!a.pid) continue;
      this.send(w, { t: 'room', room, now, you: a.spectate ? null : a.pid });
    }
    void this.pushSummary(true);
  }

  private async pushSummary(force: boolean) {
    const r = this.room;
    if (!r) return;
    const now = Date.now();
    if (!force && now - this.lastSummary < SUMMARY_INTERVAL) return;
    this.lastSummary = now;
    const s: MatchSummary = {
      code: r.code,
      kind: r.kind,
      ranked: r.ranked,
      public: r.public,
      gameId: r.gameId,
      mode: r.mode,
      state: r.state,
      players: r.players.map((p) => ({ name: p.name, score: p.score, done: p.done, rating: p.rating })),
      max: r.max,
      spectators: this.view().spectators,
      updatedAt: now,
    };
    try {
      if (r.players.length === 0) await lobbyOf(this.env).removeMatch(r.code);
      else await lobbyOf(this.env).upsertMatch(s);
    } catch (e) {
      console.warn('lobby update failed', e);
    }
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 1024) return;
    let msg: MatchIn;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const r = await this.getRoom();
    if (!r) {
      this.send(ws, { t: 'error', msg: 'This room doesn’t exist or has closed.', fatal: true });
      try {
        ws.close(4004, 'no room');
      } catch {
        /* ignore */
      }
      return;
    }
    const a = this.att(ws);
    const me = a.pid && !a.spectate ? r.players.find((p) => p.pid === a.pid) : undefined;
    const now = Date.now();

    switch (msg.t) {
      case 'hello': {
        if (!PID_RE.test(msg.pid)) return this.send(ws, { t: 'error', msg: 'Bad player id', fatal: true });
        const row = await db.authenticate(this.env, msg.pid, msg.key);
        if (!row) return this.send(ws, { t: 'error', msg: 'Not signed in', fatal: true });
        const name = row.name;
        const existing = r.players.find((p) => p.pid === msg.pid);
        let spectate = !!msg.spectate;
        if (existing && !spectate) {
          existing.connected = true;
          existing.leftAt = 0;
          existing.name = name;
          existing.handle = row.handle;
          existing.skin = row.skin;
        } else if (!spectate) {
          const allowed = !r.expect || r.expect.includes(msg.pid);
          if (r.state !== 'lobby' && r.state !== 'done') spectate = true;
          else if (!allowed) spectate = true;
          else if (r.players.length >= r.max && !this.evictBot()) spectate = true;
          else {
            r.players.push({
              pid: msg.pid,
              name,
              handle: row.handle,
              skin: row.skin,
              rating: row.rating,
              ready: false,
              connected: true,
              score: 0,
              level: 0,
              done: false,
              relaxed: !!msg.relaxed,
              timeline: [],
              forfeit: false,
              leftAt: 0,
            });
            if (!r.players.some((p) => p.pid === r.host) || isBot(r.host)) r.host = msg.pid;
          }
        }
        ws.serializeAttachment({ ...a, pid: msg.pid, spectate } satisfies Att);
        await this.save();
        this.pushRoom();
        return;
      }

      case 'ready': {
        if (!me || (r.state !== 'lobby' && r.state !== 'done')) return;
        if (r.state === 'done') this.resetRound();
        me.ready = !!msg.ready;
        await this.maybeAutoStart();
        await this.save();
        this.pushRoom();
        return;
      }

      case 'rematch': {
        if (!me || r.state !== 'done') return;
        this.resetRound();
        me.ready = true;
        await this.maybeAutoStart();
        await this.save();
        this.pushRoom();
        return;
      }

      case 'pick': {
        if (!me || me.pid !== r.host || (r.state !== 'lobby' && r.state !== 'done') || r.ranked) return;
        if (typeof msg.gameId !== 'string' || !/^[a-z0-9-]{2,40}$/.test(msg.gameId)) return;
        if (r.state === 'done') this.resetRound();
        r.gameId = msg.gameId;
        for (const p of r.players) p.ready = isBot(p.pid);
        await this.save();
        this.pushRoom();
        return;
      }

      case 'settings': {
        if (!me || me.pid !== r.host) return;
        let changed = false;
        if (typeof msg.public === 'boolean' && r.kind === 'party') {
          r.public = msg.public;
          changed = true;
        }
        if (typeof msg.bots === 'boolean' && r.kind === 'party' && msg.bots !== !!r.botFill) {
          r.botFill = msg.bots;
          // Turning bots off clears the bot seats (between rounds only).
          if (!msg.bots && (r.state === 'lobby' || r.state === 'done')) r.players = r.players.filter((p) => !isBot(p.pid));
          changed = true;
          await this.schedule();
        }
        // Scoring can be switched in unranked rooms between rounds; everyone has to ready up again.
        if (isScoreMode(msg.mode) && msg.mode !== r.mode && !r.ranked && (r.state === 'lobby' || r.state === 'done')) {
          if (r.state === 'done') this.resetRound();
          r.mode = msg.mode;
          for (const p of r.players) p.ready = isBot(p.pid);
          changed = true;
        }
        if (!changed) return;
        await this.save();
        this.pushRoom();
        return;
      }

      case 'start': {
        // Parties: the host starts once at least two players are in.
        if (!me || me.pid !== r.host || r.kind !== 'party') return;
        if (r.state === 'done') this.resetRound();
        if (r.state !== 'lobby' || !r.gameId) return;
        await this.fillBots(true); // starting now: empty seats the bots would have taken are filled first
        if (r.players.filter((p) => p.connected).length < 2) return;
        await this.startCountdown();
        return;
      }

      case 'score':
      case 'done': {
        if (!me || me.done || (r.state !== 'playing' && r.state !== 'countdown')) return;
        if (now > r.endsAt + ROUND_GRACE_MS) return; // the clock has run out
        if (msg.t === 'score' && now - a.lastScore < SCORE_MIN_INTERVAL) return;
        const s = Math.max(0, Math.min(1e9, Math.floor(Number(msg.s) || 0)));
        const l = Math.max(0, Math.min(1e4, Math.floor(Number(msg.l) || 0)));
        me.score = s;
        me.level = l;
        // The personal best is fixed by the first report of the round, so it can't be lowered mid-round.
        if (me.best === undefined && msg.b !== undefined) me.best = Math.max(0, Math.min(1e9, Math.floor(Number(msg.b) || 0)));
        if (r.mode === 'friendly') me.rel = relativeScore(s, me.best);
        const t = Math.max(0, now - r.startAt);
        const last = me.timeline[me.timeline.length - 1];
        if (!last || t - last[0] >= TIMELINE_STEP_MS || msg.t === 'done') me.timeline.push([t, s]);
        if (msg.t === 'score') {
          ws.serializeAttachment({ ...a, lastScore: now });
          const out = JSON.stringify({ t: 'score', pid: me.pid, s, l, b: me.best } satisfies MatchOut);
          for (const w of this.open()) if (w !== ws) w.send(out);
          void this.pushSummary(false);
          await this.save(false);
          return;
        }
        me.done = true;
        if (this.allDone()) await this.finish();
        else {
          await this.save();
          this.pushRoom();
        }
        return;
      }

      case 'emote': {
        if (!a.pid || !EMOTES.includes(msg.e) || now - a.lastEmote < 1000) return;
        ws.serializeAttachment({ ...a, lastEmote: now });
        const out = JSON.stringify({ t: 'emote', pid: a.pid, e: msg.e } satisfies MatchOut);
        for (const w of this.open()) w.send(out);
        return;
      }

      case 'leave': {
        await this.dropPlayer(a.pid, true);
        try {
          ws.close(1000, 'left');
        } catch {
          /* ignore */
        }
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      /* already closed */
    }
    const a = this.att(ws);
    if (!a.pid) return;
    // Another tab of the same player may still be connected.
    if (this.open().some((w) => w !== ws && this.att(w).pid === a.pid && !this.att(w).spectate)) return;
    if (a.spectate) {
      if (this.room) this.pushRoom();
      return;
    }
    await this.dropPlayer(a.pid, false);
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws, 1011);
  }

  /** `left` = the player pressed Leave (immediate forfeit); otherwise they may reconnect within the grace period. */
  private async dropPlayer(pid: string, left: boolean) {
    const r = await this.getRoom();
    if (!r || !pid) return;
    const p = r.players.find((x) => x.pid === pid);
    if (!p) return;
    if (r.state === 'lobby' || r.state === 'done') {
      r.players = r.players.filter((x) => x !== p);
      // Bots never stay on their own, and never host.
      if (!this.humans().length) r.players = [];
      if (r.host === pid && this.humans()[0]) r.host = this.humans()[0].pid;
      if (r.state === 'done') for (const x of r.players) x.ready = isBot(x.pid);
    } else {
      p.connected = false;
      p.leftAt = Date.now();
      if (left) {
        p.forfeit = true;
        p.done = true;
      }
      if (this.allDone()) {
        await this.finish();
        return;
      }
      await this.schedule();
    }
    await this.save();
    this.pushRoom();
  }

  // ---------- round lifecycle ----------
  private resetRound() {
    const r = this.room!;
    r.state = 'lobby';
    r.round++;
    r.startAt = 0;
    r.endsAt = 0;
    for (const p of r.players) {
      p.ready = isBot(p.pid);
      p.score = 0;
      p.level = 0;
      p.done = false;
      delete p.brain;
      p.timeline = [];
      p.forfeit = false;
      delete p.place;
      delete p.delta;
      delete p.best;
      delete p.rel;
    }
  }

  private async maybeAutoStart() {
    const r = this.room!;
    // Duels start as soon as both players are ready.
    if (r.kind === 'duel' && r.state === 'lobby' && r.gameId && r.players.length === 2 && r.players.every((p) => p.ready && p.connected)) {
      await this.startCountdown();
    }
  }

  private async startCountdown() {
    const r = this.room!;
    const now = Date.now();
    r.state = 'countdown';
    r.seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
    r.startAt = now + COUNTDOWN_MS;
    r.endsAt = r.startAt + ROUND_MS;
    for (const p of r.players) {
      p.score = 0;
      p.level = 0;
      p.done = !p.connected; // someone who already dropped doesn't hold the round open
      p.forfeit = !p.connected;
      p.timeline = [];
      delete p.best;
      delete p.rel;
      delete p.brain;
    }
    this.ghosts = [];
    if (r.gameId && r.players.some((p) => isBot(p.pid))) {
      try {
        this.ghosts = (await lobbyOf(this.env).ghosts(r.gameId)) as GhostRun[];
      } catch {
        /* bots fall back to pacing */
      }
    }
    await this.save();
    await this.schedule();
    this.pushRoom();
  }

  private allDone(): boolean {
    const r = this.room!;
    const h = this.humans();
    return h.length > 0 && h.every((p) => p.done);
  }

  private async finish() {
    const r = this.room!;
    if (r.state === 'done') return;
    r.state = 'done';
    const now = Date.now();
    for (const p of r.players) {
      // Bots play out the full minute even if everyone else finished early.
      if (isBot(p.pid) && !p.forfeit) {
        this.ensureBrain(p, now);
        p.score = botScore(p.brain!, ROUND_MS, ROUND_MS, p.score, this.liveHuman());
        p.level = botLevel(p.brain!, ROUND_MS, ROUND_MS);
      }
      if (!p.done) p.done = true; // time cap reached: last reported score stands
      p.ready = isBot(p.pid);
    }
    if (r.mode === 'friendly') for (const p of r.players) p.rel = relativeScore(p.score, p.best);
    // Places: forfeits last, then by score (friendly: percent of own best); equal values share a place.
    const val = (p: PState) => rankValue(r.mode, p);
    const order = [...r.players].sort((x, y) => Number(x.forfeit) - Number(y.forfeit) || val(y) - val(x));
    order.forEach((p, i) => {
      const prev = order[i - 1];
      p.place = prev && !prev.forfeit && !p.forfeit && val(prev) === val(p) ? prev.place : i + 1;
    });
    const lobby = lobbyOf(this.env);
    try {
      const deltas = await db.recordMatch(this.env, {
        code: r.code,
        gameId: r.gameId,
        kind: r.kind,
        // Friendly rounds never touch ratings.
        // Rounds with bots are never ranked; bots aren't players in the database.
        ranked: r.ranked && r.mode === 'standard' && r.players.length === 2 && !r.players.some((p) => isBot(p.pid)),
        mode: r.mode,
        players: this.humans().map((p) => ({ pid: p.pid, score: p.score, place: p.place!, forfeit: p.forfeit, rel: p.rel })),
      });
      for (const p of r.players) {
        if (deltas[p.pid] === undefined) continue;
        p.delta = deltas[p.pid];
        p.rating += deltas[p.pid];
      }
      if (Object.keys(deltas).length) await lobby.refreshFor(Object.keys(deltas));
    } catch (e) {
      console.warn('recording the match failed', e);
    }
    if (r.gameId) {
      for (const p of r.players) {
        if (p.forfeit || p.timeline.length < 3 || isBot(p.pid)) continue;
        lobby.addGhost(r.gameId, { name: p.name, score: p.score, timeline: p.timeline }).catch(() => {});
      }
    }
    await this.save();
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    this.pushRoom();
  }

  /** One alarm drives countdown → playing, reconnect grace, the round cap and idle cleanup. */
  private async schedule() {
    const r = this.room!;
    const now = Date.now();
    let at = now + IDLE_MS;
    if (r.state === 'countdown') at = r.startAt;
    else if (r.state === 'playing') {
      at = r.endsAt + ROUND_GRACE_MS;
      for (const p of r.players) if (!p.connected && !p.done && p.leftAt) at = Math.min(at, p.leftAt + GRACE_MS);
      if (r.players.some((p) => isBot(p.pid))) at = Math.min(at, now + BOT_TICK_MS);
    } else if (r.state === 'lobby' && this.fillDue() !== null) at = Math.min(at, this.fillDue()!);
    await this.ctx.storage.setAlarm(Math.max(now + 50, at));
  }

  async alarm() {
    const r = await this.getRoom();
    if (!r) return;
    const now = Date.now();
    if (r.state === 'countdown' && now >= r.startAt - 20) {
      r.state = 'playing';
      await this.save();
      await this.schedule();
      this.pushRoom();
      return;
    }
    if (r.state === 'playing') {
      this.tickBots(now);
      await this.save(false);
      let changed = false;
      for (const p of r.players) {
        if (!p.connected && !p.done && p.leftAt && now - p.leftAt >= GRACE_MS) {
          p.done = true;
          p.forfeit = true;
          changed = true;
        }
      }
      if (now >= r.endsAt + ROUND_GRACE_MS - 20 || this.allDone()) {
        await this.finish();
        return;
      }
      if (changed) {
        await this.save();
        this.pushRoom();
      }
      await this.schedule();
      return;
    }
    if (r.state === 'lobby' && this.fillDue() !== null) {
      if (now >= r.createdAt + FILL_START_MS - 20) await this.fillBots(false);
      await this.schedule();
      return;
    }
    // lobby / done: clean up rooms nobody is using.
    if (this.open().length === 0 && now - r.touchedAt >= IDLE_MS - 1000) {
      await lobbyOf(this.env)
        .removeMatch(r.code)
        .catch(() => {});
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    await this.ctx.storage.setAlarm(now + IDLE_MS);
  }

  // ---------- bots ----------
  /** Highest live human score (pacing bots follow it when nothing else is known). */
  private liveHuman() {
    return Math.max(0, ...this.humans().map((p) => p.score));
  }

  private ensureBrain(p: PState, now: number) {
    if (p.brain) return;
    const r = this.room!;
    const bests = this.humans().map((h) => h.best ?? 0).filter((b) => b > 0);
    // Wait briefly for the humans' first score report (it carries their personal best).
    if (!bests.length && now - r.startAt < 3000 && r.state === 'playing') return;
    p.brain = makeBrain({ best: bests.length ? bests.reduce((a, b) => a + b, 0) / bests.length : undefined, rating: p.rating, ghosts: this.ghosts });
  }

  private tickBots(now: number) {
    const r = this.room!;
    const t = Math.max(0, now - r.startAt);
    const live = this.liveHuman();
    for (const p of r.players) {
      if (!isBot(p.pid) || p.done) continue;
      this.ensureBrain(p, now);
      if (!p.brain) continue;
      const s = botScore(p.brain, Math.min(t, ROUND_MS), ROUND_MS, p.score, live);
      const l = botLevel(p.brain, Math.min(t, ROUND_MS), ROUND_MS);
      if (s === p.score && l === p.level) continue;
      p.score = s;
      p.level = l;
      p.timeline.push([t, s]);
      const out = JSON.stringify({ t: 'score', pid: p.pid, s, l } satisfies MatchOut);
      for (const w of this.open()) w.send(out);
    }
    void this.pushSummary(false);
  }

  /** When the next bot should take a seat in this party, or null if no filling is pending. */
  private fillDue(): number | null {
    const r = this.room!;
    if (r.kind !== 'party' || !r.botFill || r.state !== 'lobby' || r.players.length >= r.max || !this.humans().length) return null;
    const start = r.createdAt + FILL_START_MS;
    const now = Date.now();
    if (now < start) return start;
    // Spread the remaining seats so the room is full by FILL_END_MS (or right away if that's already past).
    const left = Math.max(0, r.createdAt + FILL_END_MS - now);
    return now + Math.max(400, Math.floor(left / (r.max - r.players.length)));
  }

  /** Seat one bot (or every free seat with `all`). */
  private async fillBots(all: boolean) {
    const r = this.room!;
    if (r.kind !== 'party' || !r.botFill) return;
    const rating = this.avgHumanRating();
    while (r.players.length < r.max) {
      this.addBot(rating);
      if (!all) break;
    }
    await this.save();
    this.pushRoom();
  }

  /** A human wants a seat in a full room: a bot gives up its seat (between rounds only). */
  private evictBot(): boolean {
    const r = this.room!;
    if (r.state !== 'lobby' && r.state !== 'done') return false;
    const i = r.players.map((p) => isBot(p.pid)).lastIndexOf(true);
    if (i < 0) return false;
    r.players.splice(i, 1);
    return true;
  }
}
