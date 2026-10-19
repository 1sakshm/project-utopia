import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Info, Pencil, Settings as Cog, ShieldCheck, ShoppingBag } from 'lucide-react';
import { GAMES, GAME_BY_ID } from '@/games/registry';
import { RINGS, ABILITY_RING, type RingId } from '@/platform/abilities';
import { useProgress } from '@/platform/progress';
import { useSettings } from '@/platform/settings';
import { useEconomy, levelProgress, questsFor, utcDay } from '@/platform/economy';
import { useProfile, initials } from '@/platform/profile';
import { useVersusLive } from '@/platform/versus/live';
import { VERSUS_ENABLED } from '@/platform/versus/config';
import { track } from '@/platform/analytics';
import { navigate } from '../router';
import { formatScore } from '../components/Common';
import Wallet from '../components/Wallet';
import { NameSheet } from '../components/NameSheet';

const relTime = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
};

export default function You() {
  const history = useProgress((s) => s.history);
  const games = useProgress((s) => s.games);
  const goal = useSettings((s) => s.weeklyGoalMin);
  const xp = useEconomy((s) => s.xp);
  const lp = levelProgress(xp);
  const name = useProfile((s) => s.name);
  const record = useVersusLive((s) => s.me);
  const [nameOpen, setNameOpen] = useState(false);
  const [allBests, setAllBests] = useState(false);

  const week = useMemo(() => {
    const since = Date.now() - 7 * 864e5;
    const perRing = Object.fromEntries(RINGS.map((r) => [r.id, 0])) as Record<RingId, number>;
    let total = 0;
    let sessions = 0;
    const days = new Set<string>();
    for (const h of history) {
      if (h.t < since) continue;
      const mod = GAME_BY_ID[h.gameId];
      if (!mod) continue;
      const min = h.ms / 60000;
      perRing[ABILITY_RING[mod.manifest.abilities.primary]] += min;
      total += min;
      sessions++;
      days.add(new Date(h.t).toDateString());
    }
    return { perRing, total, sessions, days: days.size };
  }, [history]);

  const played = useMemo(
    () => GAMES.filter((g) => games[g.manifest.id]?.sessions).sort((a, b) => (games[b.manifest.id]?.lastPlayed ?? 0) - (games[a.manifest.id]?.lastPlayed ?? 0)),
    [games],
  );
  const maxRing = Math.max(1, ...Object.values(week.perRing));

  return (
    <div className="page">
      <div className="topbar">
        <h1>You</h1>
        <Wallet />
        <button className="icon-btn" aria-label="Settings" onClick={() => navigate('/settings')}>
          <Cog />
        </button>
      </div>

      <button className="me-row" onClick={() => setNameOpen(true)} aria-label={`${name}. Change name`}>
        <span className="avatar">{initials(name)}</span>
        <span className="item-body">
          <span className="item-title">
            {name} <Pencil size={13} className="dim" aria-hidden />
          </span>
          <span className="item-sub">
            Level {lp.level} · {lp.span - lp.into} XP to {lp.level + 1}
          </span>
          <span className="bar" style={{ marginTop: 6 }} aria-hidden>
            <i style={{ width: `${lp.frac * 100}%` }} />
          </span>
        </span>
        {VERSUS_ENABLED && (
          <span className="rating">
            <b className="num">{record?.rating ?? 1000}</b>
            <small>rating</small>
          </span>
        )}
      </button>

      <div className="stats wrap4" style={{ '--n': 4 } as React.CSSProperties}>
        <div>
          <b>{Math.round(week.total)}</b>
          <small>min this week{goal ? ` / ${goal}` : ''}</small>
        </div>
        <div>
          <b>{week.sessions}</b>
          <small>sessions</small>
        </div>
        <div>
          <b>{week.days}</b>
          <small>days played</small>
        </div>
        <div>
          <b>
            {played.length}
            <span className="dim">/{GAMES.length}</span>
          </b>
          <small>games tried</small>
        </div>
      </div>

      <Quests />

      <section className="section">
        <div className="section-head">
          <h2>This week by ability</h2>
        </div>
        <ul className="list ability-list">
          {RINGS.map((r) => {
            const min = week.perRing[r.id];
            return (
              <li key={r.id} className="item" aria-label={`${r.label}: ${Math.round(min)} minutes`}>
                <span className="ab-dot" style={{ background: r.color }} aria-hidden />
                <span className="ab-name">{r.label}</span>
                <span className="bar" aria-hidden>
                  <i style={{ width: `${(min / maxRing) * 100}%`, background: r.color }} />
                </span>
                <span className="item-end num">{Math.round(min)}m</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>
            Personal bests<span className="count">{played.length}</span>
          </h2>
          {played.length > 5 && (
            <button className="text-link" onClick={() => setAllBests((v) => !v)}>
              {allBests ? 'Less' : 'All'}
            </button>
          )}
        </div>
        {played.length === 0 ? (
          <div className="panel empty">
            <h3>Nothing yet</h3>
            <p>Your bests show up here after your first game.</p>
            <button className="btn" onClick={() => navigate('/feed')}>
              Find a game
            </button>
          </div>
        ) : (
          <ul className="list">
            {(allBests ? played : played.slice(0, 5)).map((g) => {
              const m = g.manifest;
              const p = games[m.id];
              return (
                <li key={m.id}>
                  <button className="item" onClick={() => navigate(`/game/${m.id}`)}>
                    <span className="item-thumb" style={{ backgroundImage: `url(/posters/${m.id}.jpg)` }} aria-hidden />
                    <span className="item-body">
                      <span className="item-title">{m.title}</span>
                      <span className="item-sub">
                        {p.sessions} {p.sessions === 1 ? 'play' : 'plays'} · level {p.highestLevel} · {relTime(p.lastPlayed)}
                      </span>
                    </span>
                    <span className="item-end">
                      <b>{m.showScore !== false ? formatScore(p.best) : '—'}</b>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <ul className="list">
          {(
            [
              ['/shop', 'Shop', ShoppingBag],
              ['/settings', 'Settings', Cog],
              ['/about', 'About Utopia', Info],
              ['/privacy', 'Privacy', ShieldCheck],
            ] as const
          ).map(([to, label, I]) => (
            <li key={to}>
              <button className="item" onClick={() => navigate(to)}>
                <I size={18} className="dim" aria-hidden />
                <span className="item-body">
                  <span className="item-title">{label}</span>
                </span>
                <ChevronRight size={16} className="dim" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <IosKeepHint />
      <NameSheet open={nameOpen} onClose={() => setNameOpen(false)} />
    </div>
  );
}

function Quests() {
  const quests = useEconomy((s) => s.quests);
  const list = quests.day === utcDay() ? quests.list : questsFor(utcDay());
  useEffect(() => void useEconomy.getState().todayQuests(), []);
  return (
    <section className="section">
      <div className="section-head">
        <h2>Today’s quests</h2>
        <span className="fine">Reset daily</span>
      </div>
      <ul className="list">
        {list.map((q) => {
          const done = q.progress >= q.target;
          return (
            <li key={q.id} className={`item ${q.claimed ? 'is-done' : ''}`}>
              <span className="item-body">
                <span className="item-title">{q.title}</span>
                <span className="bar" style={{ marginTop: 6 }} aria-hidden>
                  <i style={{ width: `${Math.min(1, q.progress / q.target) * 100}%` }} />
                </span>
              </span>
              <span className="item-end">
                {q.claimed ? (
                  'Claimed'
                ) : done ? (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      const got = useEconomy.getState().claimQuest(q.id);
                      if (got) track({ name: 'reward', source: 'quest', orbs: got });
                    }}
                  >
                    Claim {q.reward}
                  </button>
                ) : (
                  <span className="num">
                    {q.progress}/{q.target} · <i className="coin sm" aria-hidden /> {q.reward}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** iPhone Safari deletes site storage after 7 days without a visit unless the app is on the Home Screen. */
function IosKeepHint() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  if (!ios || standalone) return null;
  return (
    <p className="notice section">
      <span>
        <b>Keep your progress:</b> tap Share → Add to Home Screen. Safari can clear data for sites you haven’t opened in a week.
      </span>
    </p>
  );
}
