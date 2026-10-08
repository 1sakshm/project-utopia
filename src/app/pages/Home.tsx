import { useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronRight, Lock, Play } from 'lucide-react';
import { GAME_BY_ID } from '@/games/registry';
import { useProgress } from '@/platform/progress';
import { useEconomy, levelProgress } from '@/platform/economy';
import { computeStreak, trioStatus } from '@/platform/retention';
import { ABILITY_LABEL, ringOf } from '@/platform/abilities';
import { track } from '@/platform/analytics';
import { navigate } from '../router';
import { openGame } from './Feed';
import { AbilityIcon } from '../components/Editorial';
import Wallet from '../components/Wallet';
import '@/styles/home.css';

const art = (name: string) => `/art3d/${name}.png`;

const LINKS: Array<{ to: string; title: string; sub: string; icon: string; tint: string }> = [
  { to: '/feed', title: 'Discover', sub: 'Swipe the game feed', icon: 'video_game', tint: '#8f78ff' },
  { to: '/library', title: 'Library', sub: 'Every game, by ability', icon: 'books', tint: '#6fe3ff' },
  { to: '/progress', title: 'Progress', sub: 'Stars, quests, rhythm', icon: 'bar_chart', tint: '#8dffb0' },
  { to: '/shop', title: 'Shop', sub: 'Orb skins & themes', icon: 'shopping_bags', tint: '#ffb37a' },
  { to: '/settings', title: 'Settings', sub: 'Make it yours', icon: 'gear', tint: '#b4b9cc' },
  { to: '/welcome', title: 'About Utopia', sub: 'What this is', icon: 'crystal_ball', tint: '#ff9fb8' },
];

type SoonId = 'leaderboard' | 'friends' | 'duel' | 'random';
const SOON: Array<{ id: SoonId; title: string; sub: string; icon: string; tint: string }> = [
  { id: 'leaderboard', title: 'Leaderboards', sub: 'Climb the weekly board', icon: 'trophy', tint: '#ffd36b' },
  { id: 'friends', title: 'Friends', sub: 'Play and compare together', icon: 'busts_in_silhouette', tint: '#ff9fb8' },
  { id: 'duel', title: '1v1 Duel', sub: 'Same game, head to head', icon: 'crossed_swords', tint: '#6fe3ff' },
  { id: 'random', title: 'Random match', sub: 'Play someone new', icon: 'game_die', tint: '#8dffb0' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late?' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const games = useProgress((s) => s.games);
  const history = useProgress((s) => s.history);
  const xp = useEconomy((s) => s.xp);
  const lp = levelProgress(xp);
  const streak = useMemo(() => computeStreak(history), [history]);
  const trio = trioStatus(games);
  const nextDaily = trio.ids[trio.done.findIndex((d) => !d)];
  const recent = useMemo(() => {
    const seen: string[] = [];
    for (const h of history) if (GAME_BY_ID[h.gameId] && !seen.includes(h.gameId)) seen.push(h.gameId);
    return seen.slice(0, 8);
  }, [history]);
  const [soon, setSoon] = useState<SoonId | null>(null);
  const [voted, setVoted] = useState<string[]>(() => JSON.parse(localStorage.getItem('utopia.soonVotes') ?? '[]'));

  const go = (to: string, what: string) => {
    track({ name: 'home_click', target: what });
    navigate(to);
  };

  return (
    <div className="home">
      {/* ---------- Top bar ---------- */}
      <header className="home-top">
        <div className="home-brand">
          <span className="home-orb-sm" aria-hidden />
          <span className="display">Utopia</span>
        </div>
        <div className="home-top-right">
          <button className="home-level" onClick={() => go('/progress', 'level')} aria-label={`Level ${lp.level}, open progress`}>
            <span className="home-level-ring" style={{ '--p': lp.frac } as CSSProperties}>
              <b>{lp.level}</b>
            </span>
          </button>
          <Wallet />
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-hello">{greeting()}</p>
          <h1 className="display home-title">
            {trio.complete ? (
              <>
                Today’s 3, <span className="ab-italic">done.</span>
              </>
            ) : (
              <>
                Ready to <span className="ab-italic">play?</span>
              </>
            )}
          </h1>
          <p className="home-lead">
            {trio.complete ? 'Lovely. Keep exploring the feed, or come back tomorrow for three new games.' : 'Three short games picked for everyone today, plus a whole feed to explore.'}
          </p>
          <div className="home-ctas">
            {trio.complete ? (
              <button className="btn btn-primary btn-lg home-cta" onClick={() => go('/feed', 'hero_feed')}>
                <Play size={18} fill="currentColor" /> Discover games
              </button>
            ) : (
              <button
                className="btn btn-primary btn-lg home-cta"
                onClick={() => {
                  track({ name: 'home_click', target: 'hero_daily' });
                  openGame(nextDaily, 'daily', null);
                }}
              >
                <Play size={18} fill="currentColor" /> {trio.count === 0 ? 'Start today’s 3' : `Continue · ${trio.count + 1} of 3`}
              </button>
            )}
            <button className="btn btn-lg" onClick={() => go('/feed', 'hero_feed_secondary')}>
              Browse the feed <ArrowRight size={18} />
            </button>
          </div>
        </div>
        <HeroOrb />
      </section>

      <div className="home-grid">
        {/* ---------- Streak ---------- */}
        <section className="home-card home-streak" aria-label={`${streak.days} day streak`}>
          <img className="home-art" src={art('fire')} alt="" width={84} height={84} />
          <div className="home-streak-main">
            <p className="home-kicker">Daily streak</p>
            <p className="display home-streak-n">
              {streak.days}
              <small>{streak.days === 1 ? 'day' : 'days'}</small>
            </p>
            <p className="home-sub">
              {streak.playedToday ? 'Today counts. See you tomorrow.' : streak.days > 0 ? 'Play one game today to keep it going.' : 'Play one game to start a streak.'}
            </p>
          </div>
          <ol className="home-week" aria-hidden>
            {streak.week.map((d, i) => (
              <li key={i} className={`${d.played ? 'is-on' : ''} ${d.today ? 'is-today' : ''}`}>
                <span>{d.played ? <Check size={14} strokeWidth={3} /> : null}</span>
                <small>{d.label}</small>
              </li>
            ))}
          </ol>
          <p className={`home-freeze ${streak.freezeReady ? '' : 'is-used'}`}>
            <img src={art('ice')} alt="" width={22} height={22} />
            {streak.freezeReady ? 'Freeze ready: miss a day this week and your streak stays.' : 'Freeze used this week. Back next week.'}
          </p>
        </section>

        {/* ---------- Today's 3 ---------- */}
        <section className="home-card home-today">
          <div className="home-card-head">
            <img className="home-art sm" src={art('calendar')} alt="" width={44} height={44} />
            <div>
              <p className="home-kicker">Today’s 3 · same for everyone</p>
              <h2 className="display">{trio.count} of 3 played</h2>
            </div>
          </div>
          <ol className="home-trio">
            {trio.ids.map((id, i) => {
              const m = GAME_BY_ID[id].manifest;
              const ring = ringOf(m.abilities.primary);
              return (
                <li key={id}>
                  <button className={`home-trio-game ${trio.done[i] ? 'is-done' : ''}`} onClick={() => openGame(id, 'daily', null)}>
                    <span className="home-poster" style={{ backgroundImage: `url(/posters/${id}.jpg)` }} aria-hidden />
                    <span className="home-trio-text">
                      <small>
                        <AbilityIcon id={ring.id} color={ring.color} size={14} /> {ABILITY_LABEL[m.abilities.primary]}
                      </small>
                      <b>{m.title}</b>
                    </span>
                    <span className="home-trio-state">{trio.done[i] ? <Check size={18} strokeWidth={3} /> : <ChevronRight size={18} />}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ---------- Continue ---------- */}
        {recent.length > 0 && (
          <section className="home-card home-recent">
            <div className="home-row-head">
              <h2 className="display">Jump back in</h2>
              <button className="home-link" onClick={() => go('/library', 'recent_all')}>
                All games <ChevronRight size={16} />
              </button>
            </div>
            <ul className="home-rail">
              {recent.map((id) => {
                const m = GAME_BY_ID[id].manifest;
                return (
                  <li key={id}>
                    <button className="home-rail-card" onClick={() => openGame(id, 'normal', null)} aria-label={`Play ${m.title}`}>
                      <span className="home-rail-poster" style={{ backgroundImage: `url(/posters/${id}.jpg)` }} />
                      <b>{m.title}</b>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ---------- Links ---------- */}
        <section className="home-links" aria-label="Go to">
          {LINKS.map((l, i) => (
            <button key={l.to} className="home-card home-link-card" style={{ '--tint': l.tint, '--i': i } as CSSProperties} onClick={() => go(l.to, `link_${l.to}`)}>
              <img src={art(l.icon)} alt="" width={56} height={56} loading="lazy" />
              <span>
                <b>{l.title}</b>
                <small>{l.sub}</small>
              </span>
              <ChevronRight className="home-link-chev" size={18} />
            </button>
          ))}
        </section>

        {/* ---------- Multiplayer (coming soon) ---------- */}
        <section className="home-card home-together">
          <div className="home-row-head">
            <div>
              <p className="home-kicker">Coming soon</p>
              <h2 className="display">Play together</h2>
            </div>
            <span className="home-soon-note">Tap the ones you want first</span>
          </div>
          <div className="home-soon-grid">
            {SOON.map((s) => {
              const isVoted = voted.includes(s.id);
              return (
                <button key={s.id} className={`home-soon ${isVoted ? 'is-voted' : ''}`} style={{ '--tint': s.tint } as CSSProperties} onClick={() => setSoon(s.id)}>
                  <img src={art(s.icon)} alt="" width={64} height={64} loading="lazy" />
                  <b>{s.title}</b>
                  <small>{s.sub}</small>
                  <span className="home-soon-badge">{isVoted ? <Check size={12} strokeWidth={3} /> : <Lock size={11} />} {isVoted ? 'Voted' : 'Soon'}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {soon && (
        <SoonSheet
          item={SOON.find((s) => s.id === soon)!}
          voted={voted.includes(soon)}
          onVote={() => {
            const next = voted.includes(soon) ? voted : [...voted, soon];
            setVoted(next);
            localStorage.setItem('utopia.soonVotes', JSON.stringify(next));
            track({ name: 'coming_soon_vote', feature: soon });
          }}
          onClose={() => setSoon(null)}
        />
      )}
    </div>
  );
}

function SoonSheet({ item, voted, onVote, onClose }: { item: (typeof SOON)[number]; voted: boolean; onVote: () => void; onClose: () => void }) {
  // Portal to <body>: inside the page layer the sheet would sit under the bottom nav bar on phones.
  return createPortal(
    <div className="home-sheet-back" onClick={onClose}>
      <div className="home-sheet" role="dialog" aria-modal="true" aria-labelledby="soon-title" onClick={(e) => e.stopPropagation()} style={{ '--tint': item.tint } as CSSProperties}>
        <img src={art(item.icon)} alt="" width={96} height={96} />
        <h2 className="display" id="soon-title">
          {item.title}
        </h2>
        <p>
          {item.sub}. It isn’t ready yet. Tell us you want it and it moves up the list. Your vote is anonymous and only counts which feature people want
          most.
        </p>
        <div className="home-sheet-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={onVote} disabled={voted} autoFocus>
            {voted ? (
              <>
                <Check size={16} /> Voted
              </>
            ) : (
              'I want this'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Scattered sparkle positions (%), kept clear of the orb's center.
const SPARKS: Array<[number, number]> = [
  [12, 18], [84, 14], [6, 52], [92, 46], [20, 84], [76, 88], [48, 6], [62, 94], [30, 30], [70, 26],
];

/** Animated brand orb: layered gradients, an orbit with a moon, and drifting sparkles (pure CSS, cheap). */
function HeroOrb() {
  return (
    <div className="home-orb-stage" aria-hidden>
      <div className="home-orb-glow" />
      <div className="home-orbit back" />
      <div className="home-orb">
        <span className="home-orb-shine" />
      </div>
      <div className="home-orbit front">
        <span className="home-moon" />
      </div>
      {SPARKS.map(([x, y], i) => (
        <i key={i} className="home-spark" style={{ left: `${x}%`, top: `${y}%`, '--i': i } as CSSProperties} />
      ))}
      <img className="home-float f1" src={art('sparkles')} alt="" width={54} height={54} />
      <img className="home-float f2" src={art('glowing_star')} alt="" width={46} height={46} />
      <img className="home-float f3" src={art('gem_stone')} alt="" width={42} height={42} />
    </div>
  );
}
