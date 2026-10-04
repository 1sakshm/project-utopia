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
import { IconFeed, IconGrid, IconRings, IconSettings } from './components/Icons';
import AdHost from './components/AdHost';
import { useEconomy } from '@/platform/economy';
import { SKINS, THEMES } from '@/platform/shop';
import '@/styles/rewards.css';

const Library = lazy(() => import('./pages/Library'));
const GameDetail = lazy(() => import('./pages/GameDetail'));
const Progress = lazy(() => import('./pages/Progress'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const Lab = lazy(() => import('./pages/Lab'));
const Shop = lazy(() => import('./pages/Shop'));
const Landing = lazy(() => import('./pages/Landing'));

const TABS = [
  { path: '/', label: 'Feed', Icon: IconFeed },
  { path: '/library', label: 'Library', Icon: IconGrid },
  { path: '/progress', label: 'Progress', Icon: IconRings },
  { path: '/settings', label: 'Settings', Icon: IconSettings },
];

export default function App() {
  const path = useRoute((s) => s.path);
  const search = useRoute((s) => s.search);
  const settings = useSettings();
  const announce = usePlayUi((s) => s.announce);
  const equipped = useEconomy((s) => s.equipped);

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
    root.setProperty('--t1', theme.a1);
    root.setProperty('--t2', theme.a2);
    root.setProperty('--t3', theme.a3);
    if (settings.highContrast || theme.id === 'theme-aurora') root.removeProperty('--accent');
    else root.setProperty('--accent', theme.accent);
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
  const detail = matchPath('/game/:id', path);
  const onFeed = path === '/' || !!play;
  let page: React.ReactNode = null;
  if (path === '/library') page = <Library />;
  else if (path === '/progress') page = <Progress />;
  else if (path === '/settings') page = <Settings />;
  else if (path === '/about') page = <About />;
  else if (path === '/shop') page = <Shop />;
  else if (path === '/welcome') page = <Landing />;
  else if (detail) page = <GameDetail id={detail.id} />;
  else if (!onFeed) page = <NotFound />;

  return (
    <div className={`app ${play ? 'is-playing' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <nav className="nav" aria-label="Main">
        <div className="nav-brand" aria-hidden>
          <span className="brand-orb" />
          <span className="display">Utopia</span>
        </div>
        {TABS.map(({ path: p, label, Icon }) => {
          const active = p === '/' ? onFeed : path.startsWith(p);
          return (
            <button
              key={p}
              className={`nav-item ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                audioEngine.uiTap();
                navigate(p);
              }}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <main id="main" className="main">
        <Feed hidden={!onFeed || !!play} />
        {page && (
          <div className="page-layer" key={path}>
            <Suspense fallback={<div className="page"><div className="loader" /></div>}>{page}</Suspense>
          </div>
        )}
      </main>
      {play && <PlayOverlay key={play.id + search} gameId={play.id} daily={new URLSearchParams(search).get('daily') === '1'} />}
      <AdHost />
      <BreakReminder paused={!!play} />
      <UpdateToast blocked={!!play} />
      <div className="sr-only" aria-live="polite" role="status">
        {announce}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h1 className="display">Lost in the mist</h1>
      <p className="muted">That page doesn’t exist.</p>
      <button className="btn btn-primary" onClick={() => navigate('/')}>
        Back to the feed
      </button>
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
