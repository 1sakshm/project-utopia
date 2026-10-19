import { useEffect, useState } from 'react';
import { Check, Pencil, Share2, Swords, UserMinus, UserPlus } from 'lucide-react';
import { GAME_BY_ID } from '@/games/registry';
import { SKINS } from '@/platform/shop';
import { profileUrl } from '@/platform/profile';
import { addFriend, challenge, getProfile, removeFriend, type RecentMatch, type Relation } from '@/platform/social';
import type { PublicProfile } from '@/platform/versus/protocol';
import { navigate } from '../router';
import { BackButton } from '../components/Editorial';
import { Orb } from '../components/Orb';
import { NameSheet } from '../components/NameSheet';
import { formatScore } from '../components/Common';

const since = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

/** Public player profile: /@handle (or /u/handle). Shareable. */
export default function Profile({ handle }: { handle: string }) {
  const [data, setData] = useState<null | { profile: PublicProfile; online: boolean; recent: RecentMatch[]; relation: Relation }>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () =>
    getProfile(handle)
      .then((d) => {
        setData(d);
        document.title = `${d.profile.name} (@${d.profile.handle}) · Utopia`;
      })
      .catch((e) => setErr(e.message));
  useEffect(() => {
    void load();
    return () => {
      document.title = 'Utopia';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, edit]);

  if (err)
    return (
      <div className="page">
        <div className="topbar">
          <BackButton to="/versus" />
          <h1>@{handle}</h1>
        </div>
        <div className="panel empty">
          <h3>Player not found</h3>
          <p>{err}</p>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="page">
        <div className="loader" />
      </div>
    );

  const p = data.profile;
  const skin = SKINS.find((k) => k.id === p.skin) ?? SKINS[0];
  const played = p.wins + p.losses + p.draws;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const url = profileUrl(p.handle);
    try {
      if (navigator.share) await navigator.share({ title: `@${p.handle} on Utopia`, text: `Play me on Utopia: @${p.handle}`, url });
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
        <h1 />
        <button className="icon-btn" aria-label="Share profile" onClick={() => void share()}>
          {copied ? <Check /> : <Share2 />}
        </button>
      </div>

      <section className="panel profile-head">
        <span className="profile-well">
          <Orb size={96} skin={skin} />
        </span>
        <h1>{p.name}</h1>
        <span className="handle">@{p.handle}</span>
        <span className="profile-meta">
          {data.online ? <i className="online-dot" /> : <i className="offline-dot" />}
          {data.online ? 'Online' : 'Offline'} · joined {since(p.createdAt)}
        </span>
        <div className="profile-actions">
          {data.relation === 'self' && (
            <button className="btn" onClick={() => setEdit(true)}>
              <Pencil size={15} /> Edit profile
            </button>
          )}
          {data.relation === null && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void act(() => addFriend(p.handle))}>
              <UserPlus size={16} /> Add friend
            </button>
          )}
          {data.relation === 'incoming' && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void act(() => addFriend(p.handle))}>
              <Check size={16} /> Accept request
            </button>
          )}
          {data.relation === 'requested' && (
            <button className="btn" disabled={busy} onClick={() => void act(() => removeFriend(p.handle))}>
              Requested · cancel
            </button>
          )}
          {data.relation === 'friends' && (
            <>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void act(async () => navigate(`/versus/m/${await challenge(p.handle)}`))}
              >
                <Swords size={16} /> Challenge
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void act(() => removeFriend(p.handle))} aria-label="Remove friend">
                <UserMinus size={16} />
              </button>
            </>
          )}
        </div>
      </section>

      <section className="section">
        <div className="stats" style={{ '--n': 4 } as React.CSSProperties}>
          <div>
            <b>{p.rating}</b>
            <small>rating</small>
          </div>
          <div>
            <b>{p.wins}</b>
            <small>wins</small>
          </div>
          <div>
            <b>{p.losses}</b>
            <small>losses</small>
          </div>
          <div>
            <b>{p.matches}</b>
            <small>matches</small>
          </div>
        </div>
        {played > 0 && (
          <p className="fine" style={{ marginTop: 10, textAlign: 'center' }}>
            {Math.round((p.wins / played) * 100)}% win rate in ranked duels
          </p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Recent matches</h2>
        </div>
        {data.recent.length ? (
          <ul className="list">
            {data.recent.map((m, i) => {
              const g = m.gameId ? GAME_BY_ID[m.gameId]?.manifest : null;
              const others = m.players.filter((x) => x.handle !== p.handle);
              return (
                <li key={i} className="item match-row">
                  <span className="item-thumb" style={{ backgroundImage: m.gameId ? `url(/posters/${m.gameId}.jpg)` : undefined }} aria-hidden />
                  <span className="item-body">
                    <span className="item-title">
                      <span className={m.place === 1 ? 'place-1' : ''}>{m.place === 1 ? 'Won' : `${m.place}${m.place === 2 ? 'nd' : m.place === 3 ? 'rd' : 'th'}`}</span> · {g?.title ?? 'Game'}
                    </span>
                    <span className="item-sub">
                      vs {others.map((o) => (o.handle ? `@${o.handle}` : 'a ghost')).join(', ') || '—'} · {ago(m.at)}
                      {m.ranked && m.delta !== null && ` · ${m.delta >= 0 ? '+' : ''}${m.delta}`}
                    </span>
                  </span>
                  <span className="item-end">
                    <b>{formatScore(m.score)}</b>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="panel empty">
            <p>No matches yet.</p>
          </div>
        )}
      </section>
      <NameSheet open={edit} onClose={() => setEdit(false)} />
    </div>
  );
}
