import { useEffect, useState } from 'react';
import { Check, Play, Search, Share2, Swords, Trophy, UserPlus, X } from 'lucide-react';
import { GAME_BY_ID } from '@/games/registry';
import { SKINS } from '@/platform/shop';
import { useProfile, profileUrl } from '@/platform/profile';
import { addFriend, answerInvite, asyncPlayPath, challenge, removeFriend, searchPlayers, useSocial } from '@/platform/social';
import { asyncOutcome, type AsyncChallengeView, type FriendView, type InviteView, type PublicProfile } from '@/platform/versus/protocol';
import { formatScore } from '../components/Common';
import { VERSUS_ENABLED } from '@/platform/versus/config';
import { navigate } from '../router';
import { BackButton } from '../components/Editorial';
import { Orb } from '../components/Orb';

const skinOf = (id: string) => SKINS.find((k) => k.id === id) ?? SKINS[0];
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const left = (t: number) => {
  const m = Math.max(0, Math.round((t - Date.now()) / 60000));
  return m < 60 ? `${m}m left` : `${Math.round(m / 60)}h left`;
};
const gameTitle = (id: string) => GAME_BY_ID[id]?.manifest.title ?? id;

export default function Friends() {
  const s = useSocial();
  const handle = useProfile((p) => p.handle);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicProfile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => void s.refresh(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = q.trim().replace(/^@/, '');
    if (term.length < 2) return setResults(null);
    const t = window.setTimeout(() => {
      searchPlayers(term)
        .then(setResults)
        .catch((e) => setErr(e.message));
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  if (!VERSUS_ENABLED)
    return (
      <div className="page">
        <div className="topbar">
          <BackButton />
          <h1>Friends</h1>
        </div>
        <div className="notice">Online features aren’t set up on this build.</div>
      </div>
    );

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const known = new Map<string, 'friend' | 'incoming' | 'outgoing'>();
  s.friends.forEach((f) => known.set(f.handle.toLowerCase(), 'friend'));
  s.incoming.forEach((f) => known.set(f.handle.toLowerCase(), 'incoming'));
  s.outgoing.forEach((f) => known.set(f.handle.toLowerCase(), 'outgoing'));
  const friends = [...s.friends].sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen);
  const now = Date.now();
  const asyncIn = s.asyncIn.filter((c) => c.replyScore !== null || c.expiresAt > now);
  const asyncOut = s.asyncOut.filter((c) => c.replyScore !== null || c.expiresAt > now);
  const openIn = asyncIn.filter((c) => c.replyScore === null).length;

  async function shareMe() {
    if (!handle) return;
    const url = profileUrl(handle);
    try {
      if (navigator.share) await navigator.share({ title: 'Add me on Utopia', text: `Add me on Utopia: @${handle}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <BackButton to="/versus" />
        <h1>Friends</h1>
        {handle && (
          <button className="chip" onClick={() => void shareMe()} aria-label="Share your handle">
            {copied ? <Check size={13} /> : <Share2 size={13} />} @{handle}
          </button>
        )}
      </div>

      <label className="field">
        <Search size={17} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find players by @handle or name" aria-label="Find players" autoCapitalize="none" spellCheck={false} />
        {q && (
          <button className="text-link" onClick={() => setQ('')} aria-label="Clear">
            <X size={16} />
          </button>
        )}
      </label>
      {err && <p className="field-hint is-bad">{err}</p>}

      {results && (
        <section className="section">
          <div className="section-head">
            <h2>Players</h2>
          </div>
          {results.length ? (
            <ul className="list">
              {results.map((p) => {
                const rel = known.get(p.handle.toLowerCase());
                return (
                  <li key={p.handle} className="item">
                    <button className="row" style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, flexWrap: 'nowrap', textAlign: 'left' }} onClick={() => navigate(`/@${p.handle}`)}>
                      <Orb size={38} skin={skinOf(p.skin)} />
                      <span className="item-body">
                        <span className="item-title">{p.name}</span>
                        <span className="item-sub handle">@{p.handle}</span>
                      </span>
                    </button>
                    {rel === 'friend' ? (
                      <span className="chip sm">Friends</span>
                    ) : rel === 'outgoing' ? (
                      <span className="chip sm">Requested</span>
                    ) : (
                      <button className="btn btn-sm btn-primary" disabled={busy === p.handle} onClick={() => void run(p.handle, () => addFriend(p.handle))}>
                        <UserPlus size={14} /> {rel === 'incoming' ? 'Accept' : 'Add'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="panel empty">
              <p>No one by that name yet.</p>
            </div>
          )}
        </section>
      )}

      {s.invites.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>
              Challenges<span className="count">{s.invites.length}</span>
            </h2>
          </div>
          <ul className="list">
            {s.invites.map((inv) => (
              <InviteRow key={inv.id} inv={inv} />
            ))}
          </ul>
        </section>
      )}

      {asyncIn.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>
              Beat their score{openIn > 0 && <span className="count">{openIn}</span>}
            </h2>
            <span className="fine">Same game, 24 hours, first try counts</span>
          </div>
          <ul className="list">
            {asyncIn.map((c) => (
              <AsyncInRow key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}

      {s.incoming.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>
              Requests<span className="count">{s.incoming.length}</span>
            </h2>
          </div>
          <ul className="list">
            {s.incoming.map((f) => (
              <li key={f.handle} className="item">
                <PersonButton f={f} />
                <button className="btn btn-sm btn-primary" disabled={busy === f.handle} onClick={() => void run(f.handle, () => addFriend(f.handle))}>
                  <Check size={14} /> Accept
                </button>
                <button className="icon-btn" aria-label={`Decline @${f.handle}`} disabled={busy === f.handle} onClick={() => void run(f.handle, () => removeFriend(f.handle))}>
                  <X />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>
            Friends<span className="count">{friends.length}</span>
          </h2>
          <span className="fine">{friends.filter((f) => f.online).length} online</span>
        </div>
        {friends.length > 0 && (
          <div className="seg-row mode-pick-inline">
            <span>Challenge scoring</span>
            <div className="seg" role="group" aria-label="Scoring for live challenges">
              <button aria-pressed={s.duelMode === 'standard'} onClick={() => s.setDuelMode('standard')}>
                Standard
              </button>
              <button aria-pressed={s.duelMode === 'friendly'} onClick={() => s.setDuelMode('friendly')}>
                Friendly
              </button>
            </div>
          </div>
        )}
        {friends.length ? (
          <ul className="list">
            {friends.map((f) => (
              <li key={f.handle} className="item">
                <PersonButton f={f} showPresence />
                <button
                  className="btn btn-sm"
                  disabled={busy === f.handle}
                  onClick={() => void run(f.handle, async () => navigate(`/versus/m/${await challenge(f.handle)}`))}
                  aria-label={`Challenge @${f.handle}`}
                >
                  <Swords size={14} /> Challenge
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel empty">
            <h3>No friends yet</h3>
            <p>Search for someone’s @handle above, or share yours.</p>
          </div>
        )}
      </section>

      {asyncOut.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Your challenges</h2>
            <span className="fine">Send one from any results screen</span>
          </div>
          <ul className="list">
            {asyncOut.map((c) => (
              <AsyncOutRow key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}

      {s.outgoing.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>Sent</h2>
          </div>
          <ul className="list">
            {s.outgoing.map((f) => (
              <li key={f.handle} className="item">
                <PersonButton f={f} />
                <button className="btn btn-sm btn-ghost" disabled={busy === f.handle} onClick={() => void run(f.handle, () => removeFriend(f.handle))}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PersonButton({ f, showPresence = false }: { f: FriendView; showPresence?: boolean }) {
  return (
    <button className="row" style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, flexWrap: 'nowrap', textAlign: 'left' }} onClick={() => navigate(`/@${f.handle}`)}>
      <Orb size={38} skin={skinOf(f.skin)} />
      <span className="item-body">
        <span className="item-title">{f.name}</span>
        <span className="item-sub">
          <span className="handle">@{f.handle}</span>
          {showPresence && (f.online ? <><i className="online-dot" /> online</> : <>· {ago(f.lastSeen)}</>)}
        </span>
      </span>
    </button>
  );
}

function InviteRow({ inv }: { inv: InviteView }) {
  const g = inv.gameId ? GAME_BY_ID[inv.gameId]?.manifest : null;
  return (
    <li className="item">
      <Orb size={38} skin={skinOf(inv.from.skin)} />
      <span className="item-body">
        <span className="item-title">
          <span className="handle">@{inv.from.handle}</span> challenged you
        </span>
        <span className="item-sub">
          {g?.title ?? 'Any game'}
          {inv.mode === 'friendly' && ' · friendly scoring'} · {ago(inv.createdAt)}
        </span>
      </span>
      <button
        className="btn btn-sm btn-primary"
        onClick={() => {
          void answerInvite(inv, true);
          navigate(`/versus/m/${inv.code}`);
        }}
      >
        Play
      </button>
      <button className="icon-btn" aria-label="Decline" onClick={() => void answerInvite(inv, false)}>
        <X />
      </button>
    </li>
  );
}

/** A friend's "Beat my score": play it (same seed) or see how your reply went. */
function AsyncInRow({ c }: { c: AsyncChallengeView }) {
  const replied = c.replyScore !== null;
  const out = replied ? asyncOutcome(c.score, c.replyScore!) : null;
  return (
    <li className={`item async-row ${out ? `is-${out}` : ''}`}>
      <Orb size={38} skin={skinOf(c.from.skin)} spin={false} />
      <span className="item-body">
        <span className="item-title">
          <span className="handle">@{c.from.handle}</span>: beat my <b className="num">{formatScore(c.score)}</b>
        </span>
        <span className="item-sub">
          {gameTitle(c.gameId)} ·{' '}
          {replied ? (
            <span className="num">
              you scored {formatScore(c.replyScore!)} · {out === 'won' ? 'you won' : out === 'draw' ? 'draw' : 'they won'}
            </span>
          ) : (
            left(c.expiresAt)
          )}
        </span>
      </span>
      {replied ? (
        out === 'won' ? (
          <Trophy size={18} className="async-mark" aria-label="You won" />
        ) : null
      ) : (
        <button className="btn btn-sm btn-primary" onClick={() => navigate(asyncPlayPath(c))} aria-label={`Play @${c.from.handle}'s challenge on ${gameTitle(c.gameId)}`}>
          <Play size={14} /> Play
        </button>
      )}
    </li>
  );
}

/** A challenge I sent: waiting, or their result. */
function AsyncOutRow({ c }: { c: AsyncChallengeView }) {
  const replied = c.replyScore !== null;
  // From my side: I win when their reply falls short.
  const out = replied ? asyncOutcome(c.replyScore!, c.score) : null;
  return (
    <li className={`item async-row ${out ? `is-${out}` : ''}`}>
      <Orb size={38} skin={skinOf(c.to.skin)} spin={false} />
      <span className="item-body">
        <span className="item-title">
          <span className="handle">@{c.to.handle}</span> · {gameTitle(c.gameId)}
        </span>
        <span className="item-sub num">
          Your {formatScore(c.score)} ·{' '}
          {replied ? `they scored ${formatScore(c.replyScore!)} · ${out === 'won' ? 'you won' : out === 'draw' ? 'draw' : 'they won'}` : `waiting · ${left(c.expiresAt)}`}
        </span>
      </span>
      {out === 'won' ? <Trophy size={18} className="async-mark" aria-label="You won" /> : !replied ? <span className="chip sm">Sent</span> : null}
    </li>
  );
}
