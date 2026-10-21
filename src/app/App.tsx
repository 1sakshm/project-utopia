import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { matchPath, navigate, useRoute } from './router';
import Feed, { openGame } from './pages/Feed';
import PlayOverlay from './components/PlayOverlay';
import { useSettings, prefersReducedMotion } from '@/platform/settings';
import { usePlayUi } from '@/platform/play';
import { useProgress } from '@/platform/progress';
import { track, trackPage } from '@/platform/analytics';
import { loadPosters } from '@/platform/posters';
import { audioEngine } from '@/runtime/audio';
import { GAMES, GAME_BY_ID } from '@/games/registry';
import AdHost from './components/AdHost';
import Home from './pages/Home';
import { CircleUser, House, LayoutGrid, Swords } from 'lucide-react';
import { Orb } from './components/Orb';
import ErrorBoundary from './components/ErrorBoundary';
import StorageNotice from './components/StorageNotice';
import { useEconomy } from '@/platform/economy';
import { SKINS, THEMES } from '@/platform/shop';
import { useVersusLive } from '@/platform/versus/live';
import { VERSUS_ENABLED } from '@/platform/versus/config';
import { answerInvite, ensureRegistered, pendingCount, useSocial } from '@/platform/social';
import { startSync } from '@/platform/account';
import { GAME_BY_ID as GAMES_BY_ID } from '@/games/registry';

const Library = lazy(() => import('./pages/Library'));
const GameDetail = lazy(() => import('./pages/GameDetail'));
const You = lazy(() => import('./pages/You'));
const Versus = lazy(() => import('./pages/Versus'));
const Profile = lazy(() => import('./pages/Profile'));
const Friends = lazy(() => import('./pages/Friends'));
const Admin = lazy(() => import('./pages/Admin'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const Lab = lazy(() => import('./pages/Lab'));
const Shop = lazy(() => import('./pages/Shop'));
const Landing = lazy(() => import('./pages/Landing'));
const Privacy = lazy(() => import('./pages/Privacy'));

const icon = (I: typeof House) => () => <I size={21} strokeWidth={1.6} aria-hidden />;
const TABS = [
  { path: '/', label: 'Home', Icon: icon(House), match: (p: string) => p === '/' },
  { path: '/versus', label: 'Versus', Icon: icon(Swords), match: (p: string) => p.startsWith('/versus') || p.startsWith('/friends') || p.startsWith('/@') || p.startsWith('/u/') },
  { path: '/feed', label: 'Play', Icon: () => <Orb size={40} />, match: (p: string) => p === '/feed' || p.startsWith('/play/'), orb: true },
  { path: '/library', label: 'Games', Icon: icon(LayoutGrid), match: (p: string) => p.startsWith('/library') || p.startsWith('/game/') },
  { path: '/you', label: 'You', Icon: icon(CircleUser), match: (p: string) => ['/you', '/progress', '/settings', '/shop', '/about', '/privacy'].some((x) => p.startsWith(x)) },
];


export default function App() {
  const path = useRoute((s) => s.path);
  const search = useRoute((s) => s.search);
  const settings = useSettings();
  const announce = usePlayUi((s) => s.announce);
  const overlayOpen = usePlayUi((s) => s.overlays > 0);
  const feedSeen = useRef(false);
  const equipped = useEconomy((s) => s.equipped);
  const searching = useVersusLive((s) => !!s.queue || !!s.found);
  const socialPending = useSocial((s) => pendingCount(s) > 0);
  const liveInvite = searching || socialPending;

  // Sign in (device key) and stay connected to the lobby, so friend challenges arrive on any screen.
  useEffect(() => {
    if (!VERSUS_ENABLED) return;
    void ensureRegistered().then((me) => me && useSocial.getState().refresh());
    startSync();
    return useVersusLive.getState().retain();
  }, []);

  // Reflect settings globally (CSS + audio).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    root.dataset.reducedMotion = String(prefersReducedMotion(settings));
    root.dataset.readingFont = settings.readingFont;
    root.style.setProperty('--text-scale', String(settings.textScale));
    audioEngine.apply({ master: settings.master, music: settings.music, sfx: settings.sfx, voice: settings.voice, mono: settings.mono });
    audioEngine.calibrationMs = settings.calibrationMs;
  }, [settings]);

  // Equipped cosmetics: orb skin + color theme (high contrast always wins over the theme accent).
  useEffect(() => {
    const root = document.documentElement.style;
    const skin = SKINS.find((k) => k.id === equipped.skin) ?? SKINS[0];
    const theme = THEMES.find((t) => t.id === equipped.theme) ?? THEMES[0];
    root.setProperty('--skin', skin.gradient);
    root.setProperty('--skin-glow', skin.glow);
    root.setProperty('--avatar', skin.gradient);
    root.setProperty('--t1', theme.a1);
    root.setProperty('--t2', theme.a2);
    root.setProperty('--t3', theme.a3);
    if (settings.highContrast || theme.id === 'theme-aurora') {
      root.removeProperty('--accent');
      root.removeProperty('--accent-text');
    }
    else {
      root.setProperty('--accent', theme.accent);
      root.setProperty('--accent-text', theme.accent);
    }
  }, [equipped, settings.highContrast]);

  useEffect(() => {
    void loadPosters(GAMES.map((g) => g.manifest.id));
    // Anonymous retention signals for D1/D7 cohorts: days since this device first opened Utopia.
    let first = Number(localStorage.getItem('utopia.firstSeen'));
    if (!first) {
      first = Date.now();
      localStorage.setItem('utopia.firstSeen', String(first));
    }
    const totalSessions = Object.values(useProgress.getState().games).reduce((n, g) => n + g.sessions, 0);
    track({
      name: 'app_open',
      is_pwa: window.matchMedia('(display-mode: standalone)').matches,
      reduced_motion: prefersReducedMotion(),
      days_since_first: Math.floor((Date.now() - first) / 864e5),
      total_sessions: totalSessions,
      returning: totalSessions > 0,
    });
  }, []);

  // Page view per route (the play overlay counts as its own page).
  useEffect(() => {
    trackPage(path);
  }, [path]);

  if (path.startsWith('/lab')) {
    return (
      <Suspense fallback={null}>
        <Lab />
      </Suspense>
    );
  }

  const play = matchPath('/play/:id', path);
  // The feed (and the live game previews inside it) only mounts once it's first opened, then stays mounted so
  // scroll position and previews survive navigation.
  if (path === '/feed') feedSeen.current = true;
  const feedMounted = feedSeen.current;
  const detail = matchPath('/game/:id', path);
  const onFeed = path === '/feed';
  let page: React.ReactNode = null;
  if (path === '/') page = <Home />;
  else if (path === '/library') page = <Library />;
  else if (path === '/you' || path === '/progress') page = <You />;
  else if (path.startsWith('/versus')) page = <Versus path={path} />;
  else if (path === '/friends') page = <Friends />;
  else if (path === '/admin') page = <Admin />;
  else if (path.startsWith('/@') && path.length > 2) page = <Profile handle={decodeURIComponent(path.slice(2))} />;
  else if (matchPath('/u/:handle', path)) page = <Profile handle={matchPath('/u/:handle', path)!.handle} />;
  else if (path === '/settings') page = <Settings />;
  else if (path === '/about') page = <About />;
  else if (path === '/shop') page = <Shop />;
  else if (path === '/welcome') page = <Landing />;
  else if (path === '/privacy') page = <Privacy />;
  else if (detail) page = <GameDetail id={detail.id} />;
  else if (!onFeed && !play) page = <NotFound />;

  return (
    <div className={`app ${play || overlayOpen ? 'is-playing' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <nav className="nav" aria-label="Main">
        <div className="nav-brand" aria-hidden>
          <span className="brand-word">Utopia</span>
        </div>
        {TABS.map(({ path: p, label, Icon, match, orb }) => {
          const active = match(path);
          return (
            <button
              key={p}
              className={`nav-item ${active ? 'is-active' : ''} ${orb ? 'is-orb' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                audioEngine.uiTap();
                navigate(p);
              }}
            >
              <Icon />
              <span>{label}</span>
              {p === '/versus' && liveInvite && !active && <i className="nav-badge" aria-label="Matchmaking" />}
            </button>
          );
        })}
      </nav>
      <main id="main" className="main">
        {feedMounted && <Feed hidden={!onFeed || !!play} />}
        {page && (
          <div className="page-layer" key={path}>
            <ErrorBoundary where={path} onExit={() => navigate('/')}>
              <Suspense fallback={<div className="page"><div className="loader" /></div>}>{page}</Suspense>
            </ErrorBoundary>
          </div>
        )}
      </main>
      {play && (
        <ErrorBoundary key={play.id + search} where={`play:${play.id}`} onExit={() => navigate('/', { replace: true })}>
          <PlayOverlay gameId={play.id} daily={new URLSearchParams(search).get('daily') === '1'} />
        </ErrorBoundary>
      )}
      {!play && !overlayOpen && <InviteToast />}
      <StorageNotice />
      <AdHost />
      <BreakReminder paused={!!play || overlayOpen} />
      <UpdateToast blocked={!!play || overlayOpen} />
      <div className="sr-only" aria-live="polite" role="status">
        {announce}
      </div>
    </div>
  );
}

/** A friend's live challenge, shown on top of any screen (never during a game). */
function InviteToast() {
  const inv = useSocial((s) => s.toasts[s.toasts.length - 1]);
  useEffect(() => {
    if (!inv) return;
    audioEngine.uiPlay();
    // Challenges expire; drop the toast after a while (it stays listed in Friends).
    const t = window.setTimeout(() => useSocial.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== inv.id) })), 60_000);
    return () => window.clearTimeout(t);
  }, [inv]);
  if (!inv) return null;
  const game = inv.gameId ? GAMES_BY_ID[inv.gameId]?.manifest.title : null;
  const skin = SKINS.find((k) => k.id === inv.from.skin) ?? SKINS[0];
  return (
    <div className="invite-toast" role="alertdialog" aria-label={`@${inv.from.handle} challenged you`}>
      <Orb size={40} skin={skin} />
      <span className="item-body">
        <span className="item-title">
          <span className="handle">@{inv.from.handle}</span> challenged you
        </span>
        <small>1v1 · {game ?? 'any game'} · 60 seconds</small>
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
        ✕
      </button>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page">
      <div className="empty">
      <h3>Page not found</h3>
      <p>That page doesn’t exist.</p>
      <button className="btn btn-primary" onClick={() => navigate('/')}>
        Back home
      </button>
      </div>
    </div>
  );
}

/** Gentle, never-blocking break reminder (PRD §20.2). */
function BreakReminder({ paused }: { paused: boolean }) {
  const minutes = useSettings((s) => s.breakReminderMin);
  const [show, setShow] = useState(false);
  const active = useRef(0);
  useEffect(() => {
    if (!minutes) return;
    const t = window.setInterval(() => {
      if (!document.hidden) active.current += 0.5;
      if (active.current >= minutes && !paused) {
        active.current = 0;
        setShow(true);
        track({ name: 'wellbeing_reminder', action: 'shown' });
      }
    }, 30000);
    return () => window.clearInterval(t);
  }, [minutes, paused]);
  if (!show || paused) return null;
  return (
    <div className="toast" role="status">
      <p>
        <b>You’ve been here a while.</b> Stretch, blink, breathe?
      </p>
      <div className="row">
        {GAME_BY_ID['still-water'] && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setShow(false);
              track({ name: 'wellbeing_reminder', action: 'still-water' });
              openGame('still-water', 'normal', null);
            }}
          >
            Still Water
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            setShow(false);
            track({ name: 'wellbeing_reminder', action: 'dismiss' });
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/** Service-worker update prompt — only shown between games, never mid-game. */
function UpdateToast({ blocked }: { blocked: boolean }) {
  const [update, setUpdate] = useState<null | ((reload?: boolean) => Promise<void>)>(null);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;
    void import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          if (!cancelled) setUpdate(() => updateSW);
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!update || blocked) return null;
  return (
    <div className="toast" role="status">
      <p>
        <b>An update is ready.</b>
      </p>
      <div className="row">
        <button className="btn btn-primary" onClick={() => void update(true)}>
          Refresh
        </button>
        <button className="btn" onClick={() => setUpdate(null)}>
          Later
        </button>
      </div>
    </div>
  );
}
