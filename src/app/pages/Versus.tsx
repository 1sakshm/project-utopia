import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, Copy, Crown, Eye, Ghost, Link2, LogOut, Pencil, RefreshCw, Swords, Users } from 'lucide-react';
import { GAME_BY_ID } from '@/games/registry';
import type { SessionSummary } from '@/sdk/types';
import { useProfile, initials } from '@/platform/profile';
import { useVersusLive } from '@/platform/versus/live';
import { useMatch, createRoom, findGhost, secondsUntil } from '@/platform/versus/match';
import { VERSUS_ENABLED, VERSUS_POOL, ROOM_POOL, randomPoolGame } from '@/platform/versus/config';
import { EMOTES, EMOTE_LABEL, isRoomCode, type MatchSummary, type PlayerView, type RoomView } from '@/platform/versus/protocol';
import { track } from '@/platform/analytics';
import { navigate, matchPath } from '../router';
import { formatScore } from '../components/Common';
import { Sheet } from '../components/Sheet';
import PlayOverlay, { type VersusPlay } from '../components/PlayOverlay';
import { NameSheet } from '../components/NameSheet';
import { Orb } from '../components/Orb';
import { burst, burstFrom } from '../fx';
import { audioEngine } from '@/runtime/audio';
import { useEconomy } from '@/platform/economy';
import { SKINS, type SkinDef } from '@/platform/shop';
import { AdSlot } from '../components/AdSlot';

export default function Versus({ path }: { path: string }) {
  const room = matchPath('/versus/m/:code', path);
  const watch = matchPath('/versus/watch/:code', path);
  if (!VERSUS_ENABLED) return <Unconfigured />;
  if (room) return <Room key={room.code} code={room.code.toUpperCase()} />;
  if (watch) return <Room key={`w-${watch.code}`} code={watch.code.toUpperCase()} spectate />;
  return <Dashboard />;
}

function Unconfigured() {
  return (
    <div className="page">
      <div className="topbar">
        <h1>Versus</h1>
      </div>
      <div className="notice">
        <span>
          <b>Multiplayer isn’t switched on for this build.</b> Set <code>VITE_VERSUS_URL</code> to your match server’s address (see{' '}
          <code>server/README.md</code>) and rebuild.
        </span>
      </div>
    </div>
  );
}

// ============================================================ Dashboard

function Dashboard() {
  const live = useVersusLive();
  const name = useProfile((s) => s.name);
  const [nameOpen, setNameOpen] = useState(false);
  const [game, setGame] = useState<string>('any');
  const [busy, setBusy] = useState<null | 'duel' | 'party' | 'ghost'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => live.retain(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // A quick match was found: go straight to the room.
  useEffect(() => {
    if (!live.found) return;
    const c = live.found.code;
    live.consumeFound();
    navigate(`/versus/m/${c}`);
  }, [live.found]); // eslint-disable-line react-hooks/exhaustive-deps

  async function make(kind: 'duel' | 'party') {
    setBusy(kind);
    setErr(null);
    try {
      const c = await createRoom(kind, { gameId: game === 'any' ? randomPoolGame() : game, public: false });
      navigate(`/versus/m/${c}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function ghost() {
    setBusy('ghost');
    setErr(null);
    const ids = game === 'any' ? [...VERSUS_POOL].sort(() => Math.random() - 0.5) : [game];
    for (const id of ids.slice(0, 6)) {
      const run = await findGhost(id);
      if (run) {
        live.cancelQueue();
        useMatch.getState().startGhost(id, run);
        setBusy(null);
        navigate('/versus/m/GHOST');
        return;
      }
    }
    setBusy(null);
    setErr(game === 'any' ? 'No ghosts recorded yet. Play a few games first.' : 'No ghost for this game yet. Play it once and race yourself.');
  }

  const joinCode = code.trim().toUpperCase();
  const me = live.me;
  const liveMatches = live.matches.filter((m) => m.state !== 'lobby' || m.kind === 'party');

  return (
    <div className="page">
      <div className="topbar">
        <h1>Versus</h1>
        <ConnState />
      </div>

      <button className="me-row" onClick={() => setNameOpen(true)} aria-label={`Playing as ${name}. Change name`}>
        <span className="avatar">{initials(name)}</span>
        <span className="item-body">
          <span className="item-title">
            {name} <Pencil size={13} className="dim" aria-hidden />
          </span>
          <span className="item-sub">{me ? `${me.w}W · ${me.l}L${me.d ? ` · ${me.d}D` : ''}` : 'Unranked'}</span>
        </span>
        <span className="rating">
          <b className="num">{me?.rating ?? 1000}</b>
          <small>rating</small>
        </span>
      </button>

      <section className="section">
        {live.queue ? (
          <Queueing onGhost={ghost} busy={busy === 'ghost'} />
        ) : (
          <div className="play-box-panel panel">
            <div className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                disabled={live.status !== 'online'}
                onClick={() => live.queueFor(game === 'any' ? null : game)}
              >
                <Swords size={18} /> Quick match
              </button>
              <select className="select" value={game} onChange={(e) => setGame(e.target.value)} aria-label="Game for the match">
                <option value="any">Any game</option>
                {VERSUS_POOL.map((id) => (
                  <option key={id} value={id}>
                    {GAME_BY_ID[id].manifest.title}
                  </option>
                ))}
              </select>
            </div>
            <p className="fine" style={{ marginTop: 8 }}>
              Ranked 1v1. You both get the same game with the same layout. Highest score wins.
            </p>
            <div className="split3">
              <button className="btn" onClick={() => void make('duel')} disabled={!!busy}>
                <Link2 size={16} /> Friend duel
              </button>
              <button className="btn" onClick={() => void make('party')} disabled={!!busy}>
                <Users size={16} /> Party
              </button>
              <button className="btn" onClick={() => void ghost()} disabled={!!busy}>
                <Ghost size={16} /> Race a ghost
              </button>
            </div>
            <form
              className="row"
              style={{ marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (isRoomCode(joinCode)) navigate(`/versus/m/${joinCode}`);
              }}
            >
              <label className="field" style={{ flex: 1 }}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
                  placeholder="Room code"
                  aria-label="Room code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={{ letterSpacing: '0.12em', fontWeight: 600 }}
                />
              </label>
              <button className="btn" disabled={!isRoomCode(joinCode)}>
                Join
              </button>
            </form>
            {err && <p className="fine" style={{ color: 'var(--bad)', marginTop: 8 }}>{err}</p>}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            Live now<span className="count">{liveMatches.length}</span>
          </h2>
        </div>
        {liveMatches.length ? (
          <ul className="list">
            {liveMatches.map((m) => (
              <li key={m.code}>
                <LiveRow m={m} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel empty" style={{ padding: 20 }}>
            <p>{live.status === 'online' ? 'No matches right now. Start one.' : 'Connecting…'}</p>
          </div>
        )}
      </section>

      {live.leaders.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Leaderboard</h2>
          </div>
          <ol className="list">
            {live.leaders.slice(0, 10).map((r, i) => (
              <li key={`${r.name}-${i}`} className="item lb-row">
                <span className="lb-rank num">{i + 1}</span>
                <span className="item-body">
                  <span className="item-title">{r.name}</span>
                </span>
                <span className="item-end">
                  <span className="num">
                    {r.w}–{r.l}
                  </span>
                  <b className="num">{r.rating}</b>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <AdSlot slot="versus" />
      <NameSheet open={nameOpen} onClose={() => setNameOpen(false)} />
    </div>
  );
}

function ConnState() {
  const status = useVersusLive((s) => s.status);
  const online = useVersusLive((s) => s.online);
  const reconnect = useVersusLive((s) => s.reconnect);
  if (status === 'online')
    return (
      <span className="chip">
        <i className="dot is-good" aria-hidden /> {online} online
      </span>
    );
  if (status === 'offline')
    return (
      <button className="chip" onClick={reconnect}>
        <RefreshCw size={12} /> Offline · retry
      </button>
    );
  return <span className="chip">Connecting…</span>;
}

function Queueing({ onGhost, busy }: { onGhost: () => void; busy: boolean }) {
  const q = useVersusLive((s) => s.queue)!;
  const waiting = useVersusLive((s) => s.queue?.waiting ?? 0);
  const cancel = useVersusLive((s) => s.cancelQueue);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const secs = Math.floor((Date.now() - q.since) / 1000);
  return (
    <div className="panel queue2" role="status" aria-live="polite">
      <div className="radar" aria-hidden>
        <i className="radar-ring r1" />
        <i className="radar-ring r2" />
        <i className="radar-ring r3" />
        <i className="radar-sweep" />
        <Orb size={78} />
      </div>
      <p className="queue2-title">Searching…</p>
      <p className="queue2-time num">{fmtClock(secs)}</p>
      <p className="fine">
        {q.gameId ? GAME_BY_ID[q.gameId]?.manifest.title : 'Any game'}
        {waiting > 1 ? ` · ${waiting} searching` : ''}
      </p>
      <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
        <button
          className="btn btn-danger"
          onClick={() => {
            cancel();
            track({ name: 'versus', action: 'cancel' });
          }}
        >
          Cancel
        </button>
        {secs >= 12 && (
          <button className="btn" onClick={onGhost} disabled={busy}>
            <Ghost size={16} /> Race a ghost
          </button>
        )}
      </div>
    </div>
  );
}

/** Opponents don't send their skin; give each player a stable one from their id so the VS screen has two orbs. */
function skinFor(pid: string, mine: string, myId: string): SkinDef {
  if (pid === myId) return SKINS.find((k) => k.id === mine) ?? SKINS[0];
  let h = 0;
  for (const c of pid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SKINS[h % SKINS.length];
}

/** Full-screen "A VS B" slam that plays when a round starts. */
function VsIntro({ room, you }: { room: RoomView; you: string | null }) {
  const mySkin = useEconomy((s) => s.equipped.skin);
  const vsRef = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const a = window.setTimeout(() => {
      audioEngine.uiPlay();
    }, 620);
    const b = window.setTimeout(() => setGone(true), 2300);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);
  if (gone) return null;
  const me = room.players.find((p) => p.pid === you) ?? room.players[0];
  const others = room.players.filter((p) => p !== me);
  const g = room.gameId ? GAME_BY_ID[room.gameId]?.manifest : null;
  return createPortal(
    <div className="vs-intro" aria-live="assertive" aria-label={`${me?.name} versus ${others.map((o) => o.name).join(', ')}`}>
      <div className="vs-side left">
        <Orb size={92} skin={skinFor(me.pid, mySkin, you ?? '')} />
        <b>{me.name}</b>
        {room.ranked && <small>{me.rating}</small>}
      </div>
      <div className="vs-mid" ref={vsRef}>
        <span className="vs-text">VS</span>
        {g && <span className="vs-game">{g.title}</span>}
      </div>
      <div className="vs-side right">
        {room.kind === 'duel' && others[0] ? (
          <>
            <Orb size={92} skin={skinFor(others[0].pid, mySkin, you ?? '')} />
            <b>{others[0].name}</b>
            {room.ranked && <small>{others[0].rating}</small>}
          </>
        ) : (
          <>
            <div className="vs-crowd">
              {others.slice(0, 6).map((o) => (
                <Orb key={o.pid} size={46} skin={skinFor(o.pid, mySkin, you ?? '')} />
              ))}
            </div>
            <b>{others.length} rivals</b>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function LiveRow({ m }: { m: MatchSummary }) {
  const g = m.gameId ? GAME_BY_ID[m.gameId]?.manifest : null;
  const names = m.kind === 'duel' ? m.players.map((p) => p.name).join(' vs ') : `Party · ${m.players.length}/${m.max}`;
  const top = [...m.players].sort((a, b) => b.score - a.score);
  const openJoin = m.kind === 'party' && m.state === 'lobby' && m.players.length < m.max;
  return (
    <button className="item" onClick={() => navigate(openJoin ? `/versus/m/${m.code}` : `/versus/watch/${m.code}`)}>
      <span className="item-thumb" style={{ backgroundImage: m.gameId ? `url(/posters/${m.gameId}.jpg)` : undefined }} aria-hidden />
      <span className="item-body">
        <span className="item-title">{names}</span>
        <span className="item-sub">
          {m.state === 'playing' || m.state === 'countdown' ? <span className="chip is-live sm">Live</span> : m.state === 'done' ? 'Finished' : 'Open'}
          {g?.title}
          {m.ranked && ' · Ranked'}
        </span>
      </span>
      <span className="item-end">
        {openJoin ? (
          <span className="btn btn-sm">Join</span>
        ) : m.kind === 'duel' && top.length === 2 ? (
          <b className="num">
            {formatScore(m.players[0].score)}–{formatScore(m.players[1].score)}
          </b>
        ) : top[0] ? (
          <span className="num">
            <b>{formatScore(top[0].score)}</b> top
          </span>
        ) : null}
        <Eye size={16} aria-hidden />
      </span>
    </button>
  );
}

// ============================================================ Room

function Room({ code, spectate = false }: { code: string; spectate?: boolean }) {
  const st = useMatch();
  const [dismissedRound, setDismissedRound] = useState(-1);
  // The last finished round stays on screen (with rematch status) until the player moves on.
  const [lastDone, setLastDone] = useState<RoomView | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [noShow, setNoShow] = useState(false);
  const releaseLobby = useRef<null | (() => void)>(null);
  const autoReadied = useRef(-1);

  // Join (or keep the ghost race that was just set up), leave on unmount.
  useEffect(() => {
    if (code === 'GHOST') {
      useMatch.getState().join('GHOST'); // cancels a pending leave from a remount
      if (!useMatch.getState().ghost) navigate('/versus', { replace: true });
    } else useMatch.getState().join(code, { spectate });
    // Keep the lobby socket alive so our rating updates arrive.
    releaseLobby.current = useVersusLive.getState().retain();
    return () => {
      useMatch.getState().leaveSoon();
      releaseLobby.current?.();
    };
  }, [code, spectate]);

  const room = st.room;
  const me = room?.players.find((p) => p.pid === st.you) ?? null;

  useEffect(() => {
    if (room?.state === 'done') setLastDone(room);
  }, [room]);

  // Ranked quick matches ready up automatically: the countdown starts once both players are in.
  useEffect(() => {
    if (!room || !me || !room.ranked || room.state !== 'lobby' || me.ready || autoReadied.current === room.round) return;
    if (room.round > 0) return; // after a rematch, the player readies themselves
    autoReadied.current = room.round;
    st.send({ t: 'ready', ready: true });
  }, [room, me, st]);

  // The matched opponent never showed up.
  useEffect(() => {
    if (!room?.ranked || room.state !== 'lobby' || room.players.length >= 2) return setNoShow(false);
    const t = window.setTimeout(() => setNoShow(true), 20_000);
    return () => window.clearTimeout(t);
  }, [room?.ranked, room?.state, room?.players.length]);

  if (st.status === 'closed' || (st.error && !room)) {
    return (
      <div className="page">
        <RoomTop title="Match" code={null} />
        <div className="panel empty">
          <h3>Can’t open this match</h3>
          <p>{st.error ?? 'The room has closed.'}</p>
          <button className="btn" onClick={() => navigate('/versus', { replace: true })}>
            Back to Versus
          </button>
        </div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="page">
        <RoomTop title="Match" code={code} />
        <div className="loader" aria-label="Connecting" />
      </div>
    );
  }

  const g = room.gameId ? GAME_BY_ID[room.gameId]?.manifest : null;
  const isHost = room.host === st.you;
  const watching = !me;
  const inRound = room.state === 'countdown' || room.state === 'playing';
  const resultRoom = room.state === 'done' ? room : room.state === 'lobby' && lastDone?.round === room.round - 1 ? lastDone : null;
  const shownRoom = inRound ? room : resultRoom;
  const shownMe = shownRoom?.players.find((p) => p.pid === st.you) ?? null;
  const showOverlay = !!me && !!g && !!shownRoom && !!shownMe && (inRound || dismissedRound !== shownRoom.round);
  const connected = room.players.filter((p) => p.connected).length;
  const title = st.ghost ? 'Ghost race' : room.kind === 'duel' ? (room.ranked ? 'Ranked duel' : 'Duel') : 'Party';

  return (
    <div className="page">
      <RoomTop title={title} code={st.ghost ? null : room.code} onShare={() => setShareOpen(true)} reconnecting={st.status === 'reconnecting'} />

      {g && (
        <div className="panel game-pick">
          <span className="item-thumb lg" style={{ backgroundImage: `url(/posters/${g.id}.jpg)` }} aria-hidden />
          <span className="item-body">
            <span className="item-title">{g.title}</span>
            <span className="item-sub">{g.hook}</span>
          </span>
          {isHost && !room.ranked && !st.ghost && (room.state === 'lobby' || room.state === 'done') && (
            <button className="btn btn-sm" onClick={() => setGameOpen(true)}>
              Change
            </button>
          )}
        </div>
      )}

      {watching && inRound && <p className="fine" style={{ margin: '12px 0' }}>You’re watching. Scores update live.</p>}

      <section className="section">
        <div className="section-head">
          <h2>
            Players<span className="count">{room.players.length}/{room.max}</span>
          </h2>
          {room.spectators > 0 && (
            <span className="fine">
              <Eye size={12} /> {room.spectators}
            </span>
          )}
        </div>
        <Standings room={room} you={st.you} />
        {room.players.length < 2 && room.state === 'lobby' && !room.ranked && (
          <button className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setShareOpen(true)}>
            <Link2 size={16} /> Invite someone · code <b className="code">{room.code}</b>
          </button>
        )}
        {noShow && (
          <div className="notice" style={{ marginTop: 10 }}>
            <span className="spacer">Your opponent didn’t show up.</span>
            <button
              className="btn btn-sm"
              onClick={() => {
                useVersusLive.getState().queueFor(room.gameId);
                navigate('/versus', { replace: true });
              }}
            >
              Find another
            </button>
          </div>
        )}
      </section>

      {!watching && g && room.state !== 'done' && (
        <section className="section">
          <div className="section-head">
            <h2>How to play</h2>
          </div>
          <ol className="steps">
            {g.howTo.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      <div className="room-actions">
        {!watching && room.state === 'lobby' && room.kind === 'duel' && (
          <button className={`btn btn-lg btn-block ${me!.ready ? '' : 'btn-primary'}`} onClick={() => st.send({ t: 'ready', ready: !me!.ready })} disabled={!g}>
            {me!.ready ? (
              <>
                <Check size={18} /> Ready · waiting for opponent
              </>
            ) : (
              'I’m ready'
            )}
          </button>
        )}
        {!watching && (room.state === 'lobby' || room.state === 'done') && room.kind === 'party' && isHost && (
          <button className="btn btn-primary btn-lg btn-block" disabled={connected < 2 || !g} onClick={() => st.send({ t: 'start' })}>
            {connected < 2 ? 'Waiting for players…' : `Start · ${connected} players`}
          </button>
        )}
        {!watching && room.state === 'lobby' && room.kind === 'party' && !isHost && <p className="fine center">The host starts the round.</p>}
        {!watching && room.state === 'done' && room.kind === 'duel' && (
          <button className="btn btn-primary btn-lg btn-block" onClick={() => st.send({ t: 'rematch' })}>
            <RefreshCw size={16} /> Rematch
          </button>
        )}
        {isHost && room.kind === 'party' && (room.state === 'lobby' || room.state === 'done') && (
          <label className="toggle-line">
            <span>
              List publicly
              <small>Anyone can find and join from Live now.</small>
            </span>
            <input type="checkbox" className="switch" checked={room.public} onChange={(e) => st.send({ t: 'settings', public: e.target.checked })} />
          </label>
        )}
        <button className="btn btn-ghost btn-block" onClick={() => navigate('/versus')}>
          <LogOut size={16} /> {watching ? 'Stop watching' : 'Leave'}
        </button>
      </div>

      {room.players.length > 1 && !st.ghost && <EmoteBar />}
      <EmoteLayer room={room} />

      {room.state === 'countdown' && me && room.players.length > 1 && <VsIntro key={`vs-${room.round}`} room={room} you={st.you} />}
      {showOverlay && shownRoom && shownMe && (
        <VersusOverlay
          key={`${room.code}-${shownRoom.round}`}
          room={shownRoom}
          live={room}
          me={shownMe}
          onDismiss={() => setDismissedRound(shownRoom.round)}
          onLeave={() => {
            if (!inRound) setDismissedRound(shownRoom.round);
            else navigate('/versus');
          }}
        />
      )}

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Invite">
        <ShareRoom code={room.code} kind={room.kind} />
      </Sheet>
      <Sheet open={gameOpen} onClose={() => setGameOpen(false)} title="Pick a game">
        <ul className="list">
          {ROOM_POOL.map((id) => {
            const m = GAME_BY_ID[id].manifest;
            return (
              <li key={id}>
                <button
                  className="item"
                  onClick={() => {
                    st.send({ t: 'pick', gameId: id });
                    setGameOpen(false);
                  }}
                >
                  <span className="item-thumb" style={{ backgroundImage: `url(/posters/${id}.jpg)` }} aria-hidden />
                  <span className="item-body">
                    <span className="item-title">{m.title}</span>
                    <span className="item-sub">{m.hook}</span>
                  </span>
                  {room.gameId === id && <Check size={18} />}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </div>
  );
}

function RoomTop({ title, code, onShare, reconnecting }: { title: string; code: string | null; onShare?: () => void; reconnecting?: boolean }) {
  return (
    <div className="topbar">
      <button className="icon-btn" aria-label="Back to Versus" onClick={() => navigate('/versus')}>
        <ChevronRight style={{ transform: 'rotate(180deg)' }} />
      </button>
      <h1>{title}</h1>
      {reconnecting && <span className="chip">Reconnecting…</span>}
      {code && onShare && (
        <button className="chip code-chip" onClick={onShare} aria-label={`Room code ${code}. Share`}>
          {code} <Copy size={12} />
        </button>
      )}
    </div>
  );
}

function Standings({ room, you, compact = false }: { room: RoomView; you: string | null; compact?: boolean }) {
  const done = room.state === 'done';
  const live = room.state === 'playing' || room.state === 'countdown';
  const list = done || live ? [...room.players].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.score - a.score) : room.players;
  const top = Math.max(1, ...room.players.map((p) => p.score));
  return (
    <ol className={`list standings ${compact ? 'is-compact' : ''}`}>
      {list.map((p, i) => (
        <li key={p.pid} className={`item ${p.pid === you ? 'is-me' : ''}`}>
          {done || live ? <span className="lb-rank num">{done ? p.place : i + 1}</span> : <span className="avatar sm">{initials(p.name)}</span>}
          <span className="item-body">
            <span className="item-title">
              {p.name}
              {p.pid === you && <span className="dim"> (you)</span>}
              {p.pid === room.host && room.kind === 'party' && <Crown size={12} className="dim" aria-label="Host" />}
            </span>
            <span className="item-sub">
              {!p.connected ? 'Disconnected' : live ? (p.done ? 'Finished' : `Level ${p.level || 1}`) : done ? (p.delta !== undefined ? `${p.delta >= 0 ? '+' : ''}${p.delta} rating` : `Level ${p.level}`) : p.ready ? 'Ready' : 'Not ready'}
              {p.relaxed && <span className="tag">relaxed timing</span>}
              {room.ranked && !done && p.rating > 0 && <span className="num">· {p.rating}</span>}
            </span>
            {(live || done) && (
              <span className="bar score-bar" aria-hidden>
                <i style={{ width: `${(p.score / top) * 100}%` }} />
              </span>
            )}
          </span>
          <span className="item-end">
            {live || done ? <b className="num big">{formatScore(p.score)}</b> : p.ready ? <span className="check"><Check size={14} strokeWidth={3} /></span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

function EmoteBar() {
  const send = useMatch((s) => s.send);
  return (
    <div className="emote-bar" role="group" aria-label="Reactions">
      {EMOTES.map((e) => (
        <button key={e} className="pill" onClick={() => send({ t: 'emote', e })}>
          {EMOTE_LABEL[e]}
        </button>
      ))}
    </div>
  );
}

function EmoteLayer({ room }: { room: RoomView }) {
  const emotes = useMatch((s) => s.emotes);
  if (!emotes.length) return null;
  return createPortal(
    <div className="emote-layer" aria-live="polite">
      {emotes.map((ev) => (
        <span key={ev.id} className="emote-float">
          <b>{EMOTE_LABEL[ev.e]}</b> {room.players.find((p) => p.pid === ev.pid)?.name ?? 'Spectator'}
        </span>
      ))}
    </div>,
    document.body,
  );
}

function ShareRoom({ code, kind }: { code: string; kind: 'duel' | 'party' }) {
  const url = `${location.origin}/versus/m/${code}`;
  const [copied, setCopied] = useState(false);
  const text = kind === 'duel' ? 'Play me 1v1 on Utopia' : 'Join my Utopia party';
  return (
    <div className="share">
      <p className="muted">Send this link, or have them enter the code in Versus.</p>
      <div className="code-big num" aria-label={`Code ${code.split('').join(' ')}`}>
        {code}
      </div>
      <div className="row">
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title: 'Utopia', text, url });
              else {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }
            } catch {
              /* cancelled */
            }
          }}
        >
          Share link
        </button>
        <button
          className="btn"
          onClick={async () => {
            await navigator.clipboard?.writeText(url).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ============================================================ In-round overlay

function VersusOverlay({ room, live, me, onDismiss, onLeave }: { room: RoomView; live: RoomView; me: PlayerView; onDismiss: () => void; onLeave: () => void }) {
  const st = useMatch();
  const [now, setNow] = useState(Date.now());
  const sentDone = useRef(false);
  useEffect(() => {
    if (room.state !== 'countdown') return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [room.state]);
  void now;

  const countdown = room.state === 'countdown' ? secondsUntil(room.startAt, st.offset) || null : null;
  const go = room.state === 'playing' || (room.state === 'countdown' && secondsUntil(room.startAt, st.offset) === 0);
  const others = room.players.filter((p) => p.pid !== me.pid);

  const versus: VersusPlay = useMemo(
    () => ({
      seed: room.seed,
      go,
      countdown,
      ended: room.state === 'done',
      onScore: (s, l) => {
        if (!sentDone.current) useMatch.getState().send({ t: 'score', s, l });
      },
      onDone: (sum: SessionSummary) => {
        sentDone.current = true;
        useMatch.getState().send({ t: 'done', s: sum.score, l: sum.levelReached });
        track({ name: 'versus', action: 'finish', game_id: room.gameId ?? '' });
      },
      onLeave,
      hud: room.kind === 'duel' ? <DuelHud me={me} other={others[0]} /> : <PartyHud room={room} me={me.pid} />,
      result: <RoundResult room={room} live={live} me={me} onDismiss={onDismiss} />,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, live, me, go, countdown],
  );

  return createPortal(<PlayOverlay gameId={room.gameId!} daily={false} versus={versus} />, document.body);
}

function DuelHud({ me, other }: { me: PlayerView; other?: PlayerView }) {
  if (!other) return null;
  const diff = me.score - other.score;
  return (
    <div className="vs-hud" aria-label={`${other.name} has ${other.score}`}>
      <span className="vs-name">{other.name}</span>
      <span>{formatScore(other.score)}</span>
      {other.done && <span className="vs-name">done</span>}
      <span className={`vs-diff ${diff >= 0 ? 'is-ahead' : 'is-behind'}`}>
        {diff >= 0 ? '+' : '−'}
        {formatScore(Math.abs(diff))}
      </span>
    </div>
  );
}

function PartyHud({ room, me }: { room: RoomView; me: string }) {
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const myIdx = sorted.findIndex((p) => p.pid === me);
  const shown = sorted.slice(0, 3);
  if (myIdx >= 3) shown.push(sorted[myIdx]);
  return (
    <div className="vs-board">
      <ol>
        {shown.map((p) => (
          <li key={p.pid} className={p.pid === me ? 'is-me' : ''}>
            <span>{sorted.indexOf(p) + 1}</span>
            <span>{p.pid === me ? 'You' : p.name}</span>
            <span>{formatScore(p.score)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RoundResult({ room, live, me, onDismiss }: { room: RoomView; live: RoomView; me: PlayerView; onDismiss: () => void }) {
  const send = useMatch((s) => s.send);
  // Rematch status lives in the *current* room (which may already be back in the lobby).
  const rematching = live.state === 'lobby' && live.round === room.round + 1;
  const meLive = live.players.find((p) => p.pid === me.pid);
  const otherLive = live.players.find((p) => p.pid !== me.pid);
  const opponentLeft = room.kind === 'duel' && live.players.length < 2;
  const finished = room.state === 'done';
  const soleFirst = me.place === 1 && room.players.filter((p) => p.place === 1).length === 1;
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!finished || !soleFirst) return;
    const t = window.setTimeout(() => {
      burstFrom(headRef.current, { count: 120, power: 1.15 });
      window.setTimeout(() => burst(innerWidth * 0.15, innerHeight * 0.3, { count: 60 }), 250);
      window.setTimeout(() => burst(innerWidth * 0.85, innerHeight * 0.3, { count: 60 }), 420);
    }, 250);
    return () => window.clearTimeout(t);
  }, [finished, soleFirst]);
  const ghost = useMatch((s) => s.ghost);
  if (room.state !== 'done') {
    const waiting = room.players.filter((p) => !p.done && p.pid !== me.pid);
    return (
      <div className="glass-card">
        <p className="eyebrow">You scored</p>
        <div className="results-score">{formatScore(me.score)}</div>
        <p className="muted">
          Waiting for {waiting.map((p) => p.name).join(', ') || 'the others'}… scores are live.
        </p>
        <Standings room={room} you={me.pid} compact />
      </div>
    );
  }
  const won = me.place === 1 && room.players.filter((p) => p.place === 1).length === 1;
  const draw = me.place === 1 && !won;
  const heading = room.kind === 'duel' ? (won ? 'You won' : draw ? 'Draw' : 'You lost') : me.place === 1 ? 'You won' : `You placed ${ordinal(me.place ?? 0)}`;
  return (
    <div className="glass-card">
      <p className="eyebrow">{ghost ? 'Ghost race' : room.ranked ? 'Ranked duel' : room.kind === 'duel' ? 'Duel' : 'Party'}</p>
      <h2 ref={headRef} className={`result-head ${won || me.place === 1 ? 'is-win' : draw ? '' : 'is-loss'}`}>
        {heading}
      </h2>
      {me.delta !== undefined && (
        <p className="muted num">
          Rating {me.rating} ({me.delta >= 0 ? '+' : ''}
          {me.delta})
        </p>
      )}
      <Standings room={room} you={me.pid} compact />
      <div className="results-actions">
        {room.kind === 'duel' ? (
          opponentLeft ? (
            <p className="muted center">Your opponent left.</p>
          ) : rematching && meLive?.ready ? (
            <button className="btn btn-lg" disabled>
              Waiting for {otherLive?.name ?? 'opponent'}…
            </button>
          ) : (
            <>
              {rematching && otherLive?.ready && <p className="muted center">{otherLive.name} wants a rematch</p>}
              <button className="btn btn-primary btn-lg" onClick={() => send(live.state === 'done' ? { t: 'rematch' } : { t: 'ready', ready: true })} autoFocus>
                <RefreshCw size={16} /> {rematching && otherLive?.ready ? 'Accept rematch' : 'Rematch'}
              </button>
            </>
          )
        ) : (
          <button className="btn btn-primary btn-lg" onClick={onDismiss} autoFocus>
            Back to room
          </button>
        )}
        <button className="btn" onClick={() => navigate('/versus')}>
          Done
        </button>
      </div>
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
