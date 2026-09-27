import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { GAME_BY_ID } from '@/games/registry';
import { useFeed, type FeedItem } from '@/platform/feed';
import { useProgress } from '@/platform/progress';
import { useSettings } from '@/platform/settings';
import { usePlayUi } from '@/platform/play';
import { track } from '@/platform/analytics';
import { audioEngine } from '@/runtime/audio';
import { navigate, useRoute } from '../router';
import { AbilityChip, LivePreview, PosterArt, formatScore } from '../components/Common';
import { GameInfo } from '../components/GameInfo';
import { Sheet } from '../components/Sheet';
import { IconArrowDown, IconArrowUp, IconCalendar, IconHeart, IconInfo, IconPlay, IconSound, IconGrid } from '../components/Icons';

export function openGame(id: string, variant: 'normal' | 'daily', originEl?: Element | null) {
  audioEngine.unlock();
  audioEngine.uiPlay();
  usePlayUi.getState().setOrigin(originEl ? originEl.getBoundingClientRect() : null);
  navigate(`/play/${id}${variant === 'daily' ? '?daily=1' : ''}`);
}

export default function Feed({ hidden }: { hidden: boolean }) {
  const items = useFeed((s) => s.items);
  const activeIndex = useFeed((s) => s.activeIndex);
  const setActive = useFeed((s) => s.setActive);
  const scrollRequest = useFeed((s) => s.scrollRequest);
  const scroller = useRef<HTMLDivElement>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [coach, setCoach] = useState(() => !localStorage.getItem('utopia.coach'));
  const restored = useRef(false);
  const impression = useRef<{ id: string; t: number; pos: number; variant: string } | null>(null);

  const scrollToIndex = useCallback((i: number, smooth = true) => {
    const el = scroller.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(items.length - 1, i));
    el.scrollTo({ top: clamped * el.clientHeight, behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  }, [items.length]);

  // Restore exact position on mount (reload / deep link ?card=).
  useEffect(() => {
    if (restored.current || !scroller.current) return;
    restored.current = true;
    const card = new URLSearchParams(window.location.search).get('card');
    let idx = useFeed.getState().activeIndex;
    if (card) {
      const i = items.findIndex((it) => it.type === 'game' && it.gameId === card);
      if (i >= 0) idx = i;
    }
    scroller.current.scrollTop = idx * scroller.current.clientHeight;
    setActive(idx);
  }, [items, setActive]);

  useEffect(() => {
    if (scrollRequest) scrollToIndex(scrollRequest.index, scrollRequest.smooth);
  }, [scrollRequest, scrollToIndex]);

  // Active card detection from scroll position (settles after snapping).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let t = 0;
    const settle = () => {
      const i = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
      setActive(Math.max(0, Math.min(items.length - 1, i)));
    };
    const onScroll = () => {
      window.clearTimeout(t);
      t = window.setTimeout(settle, 90);
      if (coach) dismissCoach();
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    // Reels-style swipe assist: a short flick or a drag past ~18% of the card advances exactly one card.
    // Native mandatory snapping alone snaps back on short/slow drags without momentum.
    let touching = false;
    let startY = 0;
    let startT = 0;
    let startIdx = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touching = true;
      startY = e.touches[0].clientY;
      startT = performance.now();
      startIdx = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touching) return;
      touching = false;
      const t0 = e.changedTouches[0];
      if (!t0) return;
      const dy = startY - t0.clientY; // > 0 = swipe up = next card
      const dt = Math.max(1, performance.now() - startT);
      const h = el.clientHeight;
      if (Math.abs(dy) < 40 || !(Math.abs(dy) / dt > 0.35 || Math.abs(dy) > h * 0.18)) return;
      const target = Math.max(0, Math.min(items.length - 1, startIdx + (dy > 0 ? 1 : -1)));
      el.scrollTo({ top: target * h, behavior: reduced() ? 'auto' : 'smooth' });
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    // Keep the active card aligned when the feed's height changes (rotation, desktop resize) —
    // but not mid-gesture, and not for sub-pixel jitter from mobile address-bar animations.
    let lastH = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (touching || Math.abs(h - lastH) < 2) return;
      lastH = h;
      el.scrollTop = useFeed.getState().activeIndex * h;
    });
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      ro.disconnect();
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, setActive, coach]);

  // Impressions (dwell ≥ 1s) for analytics.
  useEffect(() => {
    const it = items[activeIndex];
    const prev = impression.current;
    if (prev) {
      const dwell = performance.now() - prev.t;
      if (dwell >= 1000) track({ name: 'feed_card_impression', game_id: prev.id, position: prev.pos, variant: prev.variant, preview_mode: 'live', dwell_ms: Math.round(dwell) });
    }
    impression.current = it?.type === 'game' ? { id: it.gameId, t: performance.now(), pos: activeIndex, variant: it.variant } : null;
  }, [activeIndex, items]);

  // Keyboard navigation.
  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (infoFor) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const idx = useFeed.getState().activeIndex;
      if (['ArrowDown', 'KeyJ', 'PageDown'].includes(e.code)) {
        e.preventDefault();
        scrollToIndex(idx + 1);
      } else if (['ArrowUp', 'KeyK', 'PageUp'].includes(e.code)) {
        e.preventDefault();
        scrollToIndex(idx - 1);
      } else if (e.code === 'Enter' && (e.target === document.body || (e.target as HTMLElement).classList?.contains('feed'))) {
        const it = items[idx];
        if (it?.type === 'game') {
          e.preventDefault();
          openGame(it.gameId, it.variant, document.querySelector(`[data-feed-index="${idx}"]`));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hidden, infoFor, items, scrollToIndex]);

  function dismissCoach() {
    setCoach(false);
    localStorage.setItem('utopia.coach', '1');
  }

  const active = items[activeIndex];
  const activeGame = active?.type === 'game' ? GAME_BY_ID[active.gameId] : null;

  return (
    <div className={`feed-shell ${hidden ? 'is-hidden' : ''}`} inert={hidden} aria-hidden={hidden}>
      <div
        className="feed-ambient"
        style={
          activeGame
            ? {
                background: `radial-gradient(60% 50% at 30% 30%, ${activeGame.manifest.palette.accent}33, transparent 70%),
                   radial-gradient(50% 50% at 75% 70%, ${activeGame.manifest.palette.accent2}2a, transparent 70%), ${activeGame.manifest.palette.bg}`,
              }
            : undefined
        }
        aria-hidden
      />
      <div className="feed-column">
        <div className="feed" ref={scroller} tabIndex={-1} aria-label="Game feed" role="feed">
          {items.map((it, i) => (
            <FeedCard
              key={it.key}
              item={it}
              index={i}
              total={items.length}
              active={!hidden && i === activeIndex}
              near={Math.abs(i - activeIndex) <= 2}
              onInfo={setInfoFor}
              onNext={() => scrollToIndex(i + 1)}
            />
          ))}
        </div>
        {coach && (
          <button className="coach" onClick={dismissCoach}>
            <span className="coach-swipe" aria-hidden>
              <IconArrowUp />
            </span>
            <span>Swipe up to discover · Tap <b>Play</b> to play</span>
          </button>
        )}
        <div className="feed-nav-desktop">
          <button className="icon-btn" aria-label="Previous game" onClick={() => scrollToIndex(activeIndex - 1)} disabled={activeIndex === 0}>
            <IconArrowUp />
          </button>
          <button className="icon-btn" aria-label="Next game" onClick={() => scrollToIndex(activeIndex + 1)} disabled={activeIndex >= items.length - 1}>
            <IconArrowDown />
          </button>
        </div>
      </div>
      {activeGame && (
        <aside className="feed-side" aria-label={`About ${activeGame.manifest.title}`}>
          <h2 className="display">{activeGame.manifest.title}</h2>
          <GameInfo m={activeGame.manifest} compact />
          <button className="btn" onClick={() => navigate(`/game/${activeGame.manifest.id}`)}>
            Full details
          </button>
        </aside>
      )}
      <Sheet open={!!infoFor} onClose={() => setInfoFor(null)} title={infoFor ? GAME_BY_ID[infoFor].manifest.title : ''}>
        {infoFor && (
          <>
            <GameInfo m={GAME_BY_ID[infoFor].manifest} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const id = infoFor;
                  setInfoFor(null);
                  openGame(id, 'normal', null);
                }}
              >
                <IconPlay width={18} height={18} /> Play
              </button>
              <button className="btn" onClick={() => navigate(`/game/${infoFor}`)}>
                Details page
              </button>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

const reduced = () => document.documentElement.dataset.reducedMotion === 'true';

const FeedCard = memo(function FeedCard({
  item,
  index,
  total,
  active,
  near,
  onInfo,
  onNext,
}: {
  item: FeedItem;
  index: number;
  total: number;
  active: boolean;
  near: boolean;
  onInfo: (id: string) => void;
  onNext: () => void;
}) {
  if (item.type === 'end') return <EndCard cycle={item.cycle} index={index} onNext={onNext} />;
  return <GameCard item={item} index={index} total={total} active={active} near={near} onInfo={onInfo} />;
});

function GameCard({
  item,
  index,
  total,
  active,
  near,
  onInfo,
}: {
  item: Extract<FeedItem, { type: 'game' }>;
  index: number;
  total: number;
  active: boolean;
  near: boolean;
  onInfo: (id: string) => void;
}) {
  const mod = GAME_BY_ID[item.gameId];
  const m = mod.manifest;
  const prog = useProgress((s) => s.games[m.id]);
  const toggleFav = useProgress((s) => s.toggleFavorite);
  const feedSound = useSettings((s) => s.feedSound);
  const setSettings = useSettings((s) => s.set);
  const cardRef = useRef<HTMLElement>(null);
  const best = item.variant === 'daily' ? (prog?.dailyBest?.day === today() ? prog.dailyBest.score : 0) : prog?.best ?? 0;
  const [hint, setHint] = useState(false);

  return (
    <article
      ref={cardRef}
      className="card"
      data-feed-index={index}
      aria-label={`Game ${(index % (total / 2)) + 1}: ${m.title}. ${m.hook}`}
      style={{ ['--acc' as string]: m.palette.accent, ['--acc2' as string]: m.palette.accent2 }}
    >
      <div className="card-media" onClick={() => setHint((h) => !h)}>
        {near && <PosterArt manifest={m} />}
        {near && <LivePreview module={mod} active={active} variant={item.variant} />}
      </div>
      <div className="card-scrim" aria-hidden />
      {item.variant === 'daily' && (
        <span className="card-badge">
          <IconCalendar width={14} height={14} /> Daily seed
        </span>
      )}
      {hint && (
        <div className="card-hint" onClick={() => setHint(false)}>
          <ol>
            {m.howTo.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="card-rail">
        <button
          className="icon-btn"
          aria-label={feedSound ? 'Mute previews' : 'Unmute previews'}
          aria-pressed={feedSound}
          onClick={() => {
            audioEngine.unlock();
            setSettings({ feedSound: !feedSound });
            track({ name: 'feed_card_action', game_id: m.id, action: 'sound' });
          }}
        >
          <IconSound on={feedSound} />
        </button>
        <button
          className={`icon-btn ${prog?.favorite ? 'is-fav' : ''}`}
          aria-label={prog?.favorite ? `Remove ${m.title} from favorites` : `Add ${m.title} to favorites`}
          aria-pressed={!!prog?.favorite}
          onClick={() => {
            toggleFav(m.id);
            audioEngine.uiTap();
            track({ name: 'feed_card_action', game_id: m.id, action: 'favorite' });
          }}
        >
          <IconHeart filled={!!prog?.favorite} />
        </button>
        <button
          className="icon-btn"
          aria-label={`About ${m.title}`}
          onClick={() => {
            onInfo(m.id);
            track({ name: 'feed_card_action', game_id: m.id, action: 'info' });
          }}
        >
          <IconInfo />
        </button>
      </div>
      <div className="card-meta">
        <AbilityChip ability={m.abilities.primary} />
        <h2 className="card-title display">{m.title}</h2>
        <p className="card-hook">{m.hook}</p>
        <p className="card-sub">
          {m.sessionLabel}
          {m.showScore !== false && best > 0 && (
            <>
              {' · '}
              <span className="card-best">
                Best {formatScore(best)}
              </span>
            </>
          )}
          {prog?.sessions ? null : <> · <span className="card-new">New</span></>}
        </p>
      </div>
      <button
        className="btn btn-primary btn-lg card-play"
        onClick={() => {
          track({ name: 'feed_card_action', game_id: m.id, action: 'play' });
          openGame(m.id, item.variant, cardRef.current);
        }}
        aria-label={`Play ${m.title}`}
      >
        <IconPlay width={20} height={20} /> Play
      </button>
    </article>
  );
}

function EndCard({ cycle, index, onNext }: { cycle: number; index: number; onNext: () => void }) {
  const route = useRoute((s) => s.navigate);
  return (
    <article className="card card-end" data-feed-index={index}>
      <div className="end-inner">
        <div className="end-orb" aria-hidden />
        <h2 className="display">{cycle === 0 ? 'You’ve seen them all' : 'That’s today’s seeds'}</h2>
        <p>
          {cycle === 0
            ? 'Twenty little worlds. Replay a favorite, browse by ability, or keep going for today’s Daily Seeds — the same puzzles everyone gets today.'
            : 'You’ve reached the end of the feed. Maybe a good moment for a stretch, or a slow breath with Still Water.'}
        </p>
        <div className="end-actions">
          <button className="btn" onClick={() => route('/library')}>
            <IconGrid width={18} height={18} /> Browse library
          </button>
          {cycle === 0 ? (
            <button className="btn btn-primary" onClick={onNext}>
              <IconCalendar width={18} height={18} /> Today’s Daily Seeds
            </button>
          ) : (
            GAME_BY_ID['still-water'] && (
              <button className="btn btn-primary" onClick={() => openGame('still-water', 'normal', null)}>
                Breathe with Still Water
              </button>
            )
          )}
        </div>
      </div>
    </article>
  );
}

export const today = () => new Date().toISOString().slice(0, 10);
