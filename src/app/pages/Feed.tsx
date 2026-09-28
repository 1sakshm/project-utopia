import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { GAME_BY_ID } from '@/games/registry';
import { useFeed, type FeedItem } from '@/platform/feed';
import { useProgress } from '@/platform/progress';
import { useSettings } from '@/platform/settings';
import { usePlayUi } from '@/platform/play';
import { track } from '@/platform/analytics';
import { audioEngine } from '@/runtime/audio';
import { navigate, useRoute } from '../router';
import { LivePreview, PosterArt, formatScore } from '../components/Common';
import { AbilityIcon } from '../components/Editorial';
import { FeedbackButton } from '../components/Feedback';
import { ABILITY_LABEL, RINGS, ringOf } from '@/platform/abilities';
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
  const coachRef = useRef(coach);
  coachRef.current = coach;
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
    // While a finger is down or our release animation runs, the active card must not change
    // (otherwise previews remount and titles re-animate mid-swipe).
    let gesture = false;
    const settle = () => {
      if (gesture) return;
      const i = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
      setActive(Math.max(0, Math.min(items.length - 1, i)));
    };
    const onScroll = () => {
      window.clearTimeout(t);
      t = window.setTimeout(settle, 90);
      if (coachRef.current) dismissCoach();
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    // Touch paging, TikTok-style: the feed has `touch-action: none`, so we own the gesture.
    // The page follows the finger 1:1; on release it animates to exactly one card up/down (or back).
    // Mixing native momentum + mandatory snap + a JS scrollTo on release caused a stutter-then-glide.
    let startY = 0;
    let startTop = 0;
    let startIdx = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0; // px/ms, positive = finger moving up (next card)
    let moved = false;
    let anim = 0;
    const h = () => Math.max(1, el.clientHeight);
    const maxTop = () => (items.length - 1) * h();
    const cancelAnim = () => {
      if (anim) cancelAnimationFrame(anim);
      anim = 0;
    };
    const animateTo = (target: number) => {
      cancelAnim();
      const from = el.scrollTop;
      const dist = Math.abs(target - from);
      const dur = reduced() ? 0 : Math.min(360, 180 + dist * 0.25);
      const t0 = performance.now();
      const done = () => {
        el.scrollTop = target;
        el.style.scrollSnapType = '';
        gesture = false;
        anim = 0;
        settle();
      };
      if (dur === 0 || dist < 1) return done();
      const step = (now: number) => {
        // rAF timestamps are frame-start times and can precede t0, so clamp at 0 (a negative k made the
        // eased value jump backwards: the stutter seen on phones).
        const k = Math.max(0, Math.min(1, (now - t0) / dur));
        const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
        el.scrollTop = from + (target - from) * e;
        if (k < 1) anim = requestAnimationFrame(step);
        else done();
      };
      anim = requestAnimationFrame(step);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      cancelAnim();
      gesture = true;
      moved = false;
      el.style.scrollSnapType = 'none'; // snapping would fight programmatic 1:1 dragging
      startY = lastY = e.touches[0].clientY;
      lastT = performance.now();
      velocity = 0;
      startTop = el.scrollTop;
      startIdx = Math.round(startTop / h());
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!gesture || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = 0.8 * ((lastY - y) / dt) + 0.2 * velocity;
      lastY = y;
      lastT = now;
      let top = startTop + (startY - y);
      if (Math.abs(startY - y) > 6) moved = true;
      // Rubber-band past the first/last card; never drift more than one card per gesture.
      if (top < 0) top = top * 0.35;
      else if (top > maxTop()) top = maxTop() + (top - maxTop()) * 0.35;
      top = Math.max(startTop - h(), Math.min(startTop + h(), top));
      el.scrollTop = top;
    };
    const onTouchEnd = () => {
      if (!gesture) return;
      if (!moved) {
        // A tap: leave everything as it was (buttons receive their click normally).
        el.style.scrollSnapType = '';
        gesture = false;
        return;
      }
      const dy = el.scrollTop - startTop; // > 0 = moved toward next card
      const flick = Math.abs(velocity) > 0.35 && Math.sign(velocity) === Math.sign(dy);
      let idx = startIdx;
      if (Math.abs(dy) > h() * 0.2 || (flick && Math.abs(dy) > 16)) idx = startIdx + (dy > 0 ? 1 : -1);
      idx = Math.max(0, Math.min(items.length - 1, idx));
      animateTo(idx * h());
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    const touching = () => gesture;

    // Keep the active card aligned when the feed's height changes (rotation, desktop resize) —
    // but not mid-gesture, and not for sub-pixel jitter from mobile address-bar animations.
    let lastH = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (touching() || Math.abs(h - lastH) < 2) return;
      lastH = h;
      el.scrollTop = useFeed.getState().activeIndex * h;
    });
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      cancelAnim();
      el.style.scrollSnapType = '';
      ro.disconnect();
      window.clearTimeout(t);
    };
    // `coach` deliberately not a dependency (read via ref): re-running this effect mid-swipe
    // would drop the gesture state the first time the coach mark is dismissed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, setActive]);

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
        className="feed-ambient ab-aurora"
        style={
          activeGame
            ? ({
                '--a1': activeGame.manifest.palette.accent,
                '--a2': activeGame.manifest.palette.accent2,
                '--a3': activeGame.manifest.palette.highlight,
              } as React.CSSProperties)
            : undefined
        }
        aria-hidden
      >
        <i className="b1" />
        <i className="b2" />
        <i className="b3" />
      </div>
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
        <aside
          key={activeGame.manifest.id}
          className="feed-side is-active"
          aria-label={`About ${activeGame.manifest.title}`}
          style={{ ['--acc' as string]: activeGame.manifest.palette.accent, ['--acc2' as string]: activeGame.manifest.palette.accent2 }}
        >
          <p className="ab-eyebrow feed-side-eyebrow">
            <AbilityIcon id={ringOf(activeGame.manifest.abilities.primary).id} color={ringOf(activeGame.manifest.abilities.primary).color} live size={22} />
            {ABILITY_LABEL[activeGame.manifest.abilities.primary]}
          </p>
          <FeedTitle title={activeGame.manifest.title} as="p" className="feed-side-title" />
          <p className="feed-side-desc">{activeGame.manifest.description}</p>
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
  if (item.type === 'end') return <EndCard cycle={item.cycle} index={index} active={active} onNext={onNext} />;
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
  const ring = ringOf(m.abilities.primary);

  return (
    <article
      ref={cardRef}
      className={`card ${active ? 'is-active' : ''}`}
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
        <p className="card-kicker">
          <AbilityIcon id={ring.id} color={ring.color} live={active} size={22} />
          <span>{ABILITY_LABEL[m.abilities.primary]}</span>
        </p>
        <FeedTitle title={m.title} />
        <p className="card-hook">{m.hook}</p>
        <div className="card-stats">
          <span className="card-stat">{m.sessionLabel}</span>
          {m.showScore !== false && best > 0 && <span className="card-stat is-best">Best {formatScore(best)}</span>}
          {!prog?.sessions && <span className="card-stat is-new">New</span>}
        </div>
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

/** Editorial title: last word in the game's gradient italic; words rise in when the card is active. */
function FeedTitle({ title, as: Tag = 'h2', className = '' }: { title: string; as?: 'h2' | 'p'; className?: string }) {
  const words = title.split(' ');
  return (
    <Tag className={`card-title display ${className}`}>
      {words.map((w, i) => (
        <span key={i}>
          <span className={`card-word ${i === words.length - 1 ? 'is-accent' : ''}`} style={{ ['--d' as string]: `${i * 90}ms` }}>
            {w}
          </span>
          {i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  );
}

function EndCard({ cycle, index, active, onNext }: { cycle: number; index: number; active: boolean; onNext: () => void }) {
  const route = useRoute((s) => s.navigate);
  return (
    <article className={`card card-end ${active ? 'is-active' : ''}`} data-feed-index={index}>
      <div className="ab-aurora end-aurora" aria-hidden>
        <i className="b1" />
        <i className="b2" />
        <i className="b3" />
      </div>
      <div className="end-inner">
        <p className="ab-kicker">
          <span className="ab-orb" aria-hidden /> {cycle === 0 ? 'End of the feed' : 'Today’s seeds'}
        </p>
        <FeedTitle title={cycle === 0 ? 'You’ve seen them all.' : 'That’s every seed.'} className="end-title" />
        <p className="end-lead">
          {cycle === 0
            ? 'Every little world, seen once. Replay a favorite, browse by ability, or keep going for today’s Daily Seeds: the same puzzles everyone gets today.'
            : 'You’ve reached the very end. Maybe a good moment for a stretch, or a slow breath with Still Water.'}
        </p>
        <div className="end-glyphs" aria-hidden>
          {RINGS.map((r, i) => (
            <span key={r.id} style={{ ['--d' as string]: `${i * 70}ms` }}>
              <AbilityIcon id={r.id} color={r.color} live={active} size={34} />
            </span>
          ))}
        </div>
        <div className="end-actions">
          <FeedbackButton from="end-card" />
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
