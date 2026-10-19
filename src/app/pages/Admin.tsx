import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { SKINS } from '@/platform/shop';
import { VERSUS_HTTP } from '@/platform/versus/config';
import { navigate } from '../router';
import { Orb } from '../components/Orb';

interface AdminPlayer {
  id: string;
  handle: string;
  name: string;
  skin: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  createdAt: number;
  lastSeen: number;
  online: boolean;
  friends: number;
}
interface Stats {
  players: number;
  active24h: number;
  active7d: number;
  friendships: number;
  matches24h: number;
  matches: number;
  onlineNow: number;
}

const TOKEN_KEY = 'utopia.adminToken';
const when = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(t).toLocaleDateString();
};

/** Owner-only player directory. Data comes from the D1 database through the match server's admin API. */
export default function Admin() {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'recent' | 'rating' | 'new'>('recent');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; players: AdminPlayer[] } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const get = useCallback(
    async <T,>(path: string): Promise<T> => {
      const r = await fetch(`${VERSUS_HTTP}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status === 401) throw new Error('That token isn’t right.');
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      return r.json() as Promise<T>;
    },
    [token],
  );

  const load = useCallback(() => {
    if (!token) return;
    setErr(null);
    Promise.all([get<Stats>('/admin/stats'), get<{ total: number; players: AdminPlayer[] }>(`/admin/players?q=${encodeURIComponent(q)}&sort=${sort}&offset=${offset}`)])
      .then(([s, p]) => {
        setStats(s);
        setData(p);
      })
      .catch((e) => {
        setErr(e.message);
        if (/token/.test(e.message)) {
          setToken('');
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch {
            /* ignore */
          }
        }
      });
  }, [get, q, sort, offset, token]);

  useEffect(() => {
    const t = window.setTimeout(load, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  if (!VERSUS_HTTP) return <div className="page notice">The match server isn’t configured on this build.</div>;

  if (!token)
    return (
      <div className="page">
        <div className="topbar">
          <h1>Admin</h1>
        </div>
        <form
          className="panel panel-pad"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            const t = draft.trim();
            if (!t) return;
            try {
              localStorage.setItem(TOKEN_KEY, t);
            } catch {
              /* ignore */
            }
            setToken(t);
          }}
        >
          <p className="muted">Enter the admin token (the ADMIN_TOKEN secret of the match server).</p>
          <label className="field">
            <input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Admin token" aria-label="Admin token" autoComplete="off" />
          </label>
          {err && <p className="field-hint is-bad">{err}</p>}
          <button className="btn btn-primary">Open</button>
        </form>
      </div>
    );

  return (
    <div className="page is-wide">
      <div className="topbar">
        <h1>
          Players<span className="sub">{data?.total ?? '…'}</span>
        </h1>
        <button className="icon-btn" aria-label="Refresh" onClick={load}>
          <RefreshCw />
        </button>
      </div>

      {stats && (
        <div className="admin-stats">
          {(
            [
              ['Online now', stats.onlineNow],
              ['Players', stats.players],
              ['Active 24h', stats.active24h],
              ['Active 7d', stats.active7d],
              ['Matches 24h', stats.matches24h],
              ['Friendships', stats.friendships],
            ] as const
          ).map(([l, v]) => (
            <div key={l}>
              <b>{v.toLocaleString()}</b>
              <small>{l}</small>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ margin: '24px 0 16px', flexWrap: 'nowrap' }}>
        <label className="field" style={{ flex: 1 }}>
          <Search size={17} aria-hidden />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="Search handle or name"
            aria-label="Search players"
          />
        </label>
        <div className="seg" role="group" aria-label="Sort">
          {(['recent', 'rating', 'new'] as const).map((s) => (
            <button
              key={s}
              aria-pressed={sort === s}
              onClick={() => {
                setSort(s);
                setOffset(0);
              }}
            >
              {s === 'recent' ? 'Last seen' : s === 'rating' ? 'Rating' : 'Newest'}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="field-hint is-bad">{err}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Rating</th>
              <th>W–L–D</th>
              <th>Matches</th>
              <th>Friends</th>
              <th>Last seen</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {data?.players.map((p) => (
              <tr key={p.id}>
                <td className="who">
                  <Orb size={26} skin={SKINS.find((k) => k.id === p.skin) ?? SKINS[0]} spin={false} />
                  <span>
                    <a
                      href={`/@${p.handle}`}
                      className="handle"
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/@${p.handle}`);
                      }}
                    >
                      @{p.handle}
                    </a>
                    <br />
                    <span className="dim">{p.name}</span>
                  </span>
                </td>
                <td>{p.rating}</td>
                <td>
                  {p.wins}–{p.losses}–{p.draws}
                </td>
                <td>{p.matches}</td>
                <td>{p.friends}</td>
                <td>{p.online ? <span style={{ color: 'var(--sage)' }}>online</span> : when(p.lastSeen)}</td>
                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.players.length === 0 && <p className="empty">No players match.</p>}
      </div>
      {data && data.total > 50 && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>
            Previous
          </button>
          <span className="fine">
            {offset + 1}–{Math.min(offset + 50, data.total)} of {data.total}
          </span>
          <button className="btn btn-sm" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
