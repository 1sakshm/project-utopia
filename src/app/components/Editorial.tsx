// Shared "editorial" page language: aurora hero, word-reveal headline, scroll reveals, section heads,
// animated ability glyphs. Used by About, Library, Progress and Settings.
import { useEffect, useRef, useState, type CSSProperties, type DependencyList, type ReactNode } from 'react';
import type { RingId } from '@/platform/abilities';
import { prefersReducedMotion } from '@/platform/settings';
import { navigate } from '../router';
import { IconBack } from './Icons';
import '@/styles/editorial.css';

/** Stagger delay helper: sets --d for CSS transitions/animations. */
export const d = (i: number, step = 90) => ({ '--d': `${i * step}ms` }) as CSSProperties;

/**
 * Adds `.is-in` to [data-reveal] elements inside `root` as they scroll into view.
 * Re-scans when `deps` change, so lists that re-render (filters) reveal their new items too.
 */
export function useReveal(root: React.RefObject<HTMLElement | null>, deps: DependencyList = []) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, ...deps]);
}

/** Gentle pointer parallax (writes --mx/--my in -1..1 on the element). */
export function useParallax(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        el.style.setProperty('--my', (((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
}

/** Headline words that blur-rise in one after another. Spaces live outside the inline-block spans. */
export function Words({ text, start = 0 }: { text: string; start?: number }) {
  return (
    <>
      {text
        .split(' ')
        .filter(Boolean)
        .map((w, i) => (
          <span key={i}>
            <span className="ab-word" style={d(start + i)}>
              {w}
            </span>{' '}
          </span>
        ))}
    </>
  );
}

/**
 * Aurora hero. Title = `title` words + an italic gradient `accent` word + optional `tail` words.
 * `compact` is the shorter variant for tab pages.
 */
export function Hero({
  kicker,
  title,
  accent,
  tail,
  lead,
  compact = false,
  back = false,
  palette,
  children,
}: {
  kicker: string;
  title: string;
  accent: string;
  tail?: string;
  lead?: ReactNode;
  compact?: boolean;
  back?: boolean;
  /** Optional aurora colors [a, b, c]. */
  palette?: [string, string, string];
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useParallax(ref);
  const titleWords = title.split(' ').filter(Boolean).length;
  const tailWords = tail ? tail.split(' ').filter(Boolean).length : 0;
  const style = palette ? ({ '--a1': palette[0], '--a2': palette[1], '--a3': palette[2] } as CSSProperties) : undefined;
  return (
    <section className={`ab-hero ${compact ? 'is-compact' : ''}`} ref={ref} style={style}>
      <div className="ab-aurora" aria-hidden>
        <i className="b1" />
        <i className="b2" />
        <i className="b3" />
      </div>
      <div className="ab-motes" aria-hidden>
        {Array.from({ length: compact ? 9 : 14 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="ab-grain" aria-hidden />
      {back && (
        <button className="btn btn-ghost ab-back" onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/settings'))}>
          <IconBack width={18} height={18} /> Back
        </button>
      )}
      <div className="ab-hero-inner">
        <p className="ab-kicker ab-fade" style={d(0)}>
          <span className="ab-orb" aria-hidden /> {kicker}
        </p>
        <h1 className="ab-title display">
          <Words text={title} />
          <span className="ab-word ab-italic" style={d(titleWords)}>
            {accent}
          </span>
          {tail ? ' ' : null}
          {tail && <Words text={tail} start={titleWords + 1} />}
        </h1>
        {lead && (
          <p className="ab-lead ab-fade" style={d(titleWords + tailWords + 3)}>
            {lead}
          </p>
        )}
        {children && (
          <div className="ab-hero-extra ab-fade" style={d(titleWords + tailWords + 5)}>
            {children}
          </div>
        )}
      </div>
      {!compact && (
        <div className="ab-scroll-cue" aria-hidden>
          <span />
        </div>
      )}
    </section>
  );
}

export function SectionHead({ eyebrow, title, sub, index }: { eyebrow: string; title: string; sub?: ReactNode; index?: number }) {
  return (
    <header className="ab-head" data-reveal>
      <p className="ab-eyebrow">
        {index !== undefined && <span className="ab-eyebrow-num">{String(index).padStart(2, '0')}</span>}
        {eyebrow}
      </p>
      <h2 className="display">{title}</h2>
      {sub && <p className="ab-sub">{sub}</p>}
    </header>
  );
}

/** Number that counts up from 0 when first rendered (instant under reduced motion). */
export function CountUp({ value, duration = 1100 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (value - from) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown.toLocaleString()}</>;
}

export function Stat({ value, label, animate = false }: { value: number | string; label: string; animate?: boolean }) {
  return (
    <div className="ab-stat">
      <span className="display">{animate && typeof value === 'number' ? <CountUp value={value} /> : value}</span>
      <small>{label}</small>
    </div>
  );
}

/** Mini glyphs, drawn on a 24-unit grid with bold strokes so they stay legible at 14–20px. */
const MINI: Record<RingId, ReactNode> = {
  memory: (
    <>
      <circle className="g-pulse" cx="12" cy="12" r="5" />
      <circle className="g-pulse p2" cx="12" cy="12" r="5" />
      <circle className="g-dot" cx="12" cy="12" r="3" />
    </>
  ),
  attention: (
    <>
      <circle className="g-line" cx="12" cy="12" r="8.5" />
      <g className="g-spin">
        <path className="g-fill-soft" d="M12 12 L12 3.5 A8.5 8.5 0 0 1 19.4 8 Z" />
      </g>
      <circle className="g-dot" cx="12" cy="12" r="2.4" />
    </>
  ),
  perception: (
    <g className="g-rock">
      <path className="g-line" d="M2.5 12 C 6 6, 18 6, 21.5 12 C 18 18, 6 18, 2.5 12 Z" />
      <circle className="g-dot" cx="12" cy="12" r="3.4" />
    </g>
  ),
  reasoning: (
    <>
      {[0, 1].map((r) =>
        [0, 1].map((c) => <rect key={`${r}${c}`} className="g-cell" style={{ '--k': r * 2 + c } as CSSProperties} x={4.5 + c * 8} y={4.5 + r * 8} width="7" height="7" rx="2" />),
      )}
    </>
  ),
  language: (
    <>
      {[0, 1, 2, 3, 4].map((k) => (
        <rect key={k} className="g-bar" style={{ '--k': k } as CSSProperties} x={3.5 + k * 3.7} y="5" width="2.4" height="14" rx="1.2" />
      ))}
    </>
  ),
  control: (
    <>
      <circle className="g-line" cx="7.5" cy="12" r="4.5" />
      <rect className="g-line" x="13" y="7.5" width="9" height="9" rx="2" />
      <circle className="g-dot g-switch" cx="7.5" cy="12" r="2.2" />
    </>
  ),
  timing: (
    <>
      <path className="g-line" d="M6.5 21 L12 3 L17.5 21 Z" />
      <g className="g-swing">
        <line className="g-stroke" x1="12" y1="18" x2="12" y2="7" />
        <circle className="g-dot" cx="12" cy="9" r="2" />
      </g>
    </>
  ),
  calm: (
    <>
      <circle className="g-breathe" cx="12" cy="12" r="5.5" />
      <circle className="g-line" cx="12" cy="12" r="9" />
    </>
  ),
};

/**
 * Small ability badge: tinted disc + mini glyph. Still by default so long lists stay calm;
 * animates when `live`, or when an ancestor is hovered / focused / pressed / .is-active.
 */
export function AbilityIcon({ id, color, live = false, size = 22 }: { id: RingId; color: string; live?: boolean; size?: number }) {
  return (
    <span className={`ab-icon ${live ? 'is-live' : ''}`} style={{ '--c': color, '--s': `${size}px` } as CSSProperties} aria-hidden>
      <svg className="ab-glyph is-mini" viewBox="0 0 24 24">
        {MINI[id]}
      </svg>
    </span>
  );
}

/** Small animated glyph per ability family (pure SVG + CSS). */
export function AbilityGlyph({ id, className }: { id: RingId; className?: string }) {
  const glyphs: Record<RingId, ReactNode> = {
    memory: (
      <>
        <circle className="g-pulse" cx="32" cy="32" r="8" />
        <circle className="g-pulse p2" cx="32" cy="32" r="8" />
        <circle className="g-pulse p3" cx="32" cy="32" r="8" />
        <circle className="g-dot" cx="32" cy="32" r="4" />
      </>
    ),
    attention: (
      <>
        <circle className="g-line" cx="32" cy="32" r="20" />
        <g className="g-spin">
          <path className="g-fill-soft" d="M32 32 L32 12 A20 20 0 0 1 49 22 Z" />
        </g>
        <circle className="g-dot g-blink" cx="42" cy="22" r="3" />
      </>
    ),
    perception: (
      <g className="g-rock">
        <path className="g-line" d="M8 32 C 18 16, 46 16, 56 32 C 46 48, 18 48, 8 32 Z" />
        <circle className="g-dot" cx="32" cy="32" r="7" />
        <circle className="g-pupil" cx="32" cy="32" r="3" />
      </g>
    ),
    reasoning: (
      <>
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => <rect key={`${r}${c}`} className="g-cell" style={{ '--k': r * 3 + c } as CSSProperties} x={14 + c * 13} y={14 + r * 13} width="10" height="10" rx="2.5" />),
        )}
      </>
    ),
    language: (
      <>
        {[0, 1, 2, 3, 4, 5, 6].map((k) => (
          <rect key={k} className="g-bar" style={{ '--k': k } as CSSProperties} x={12 + k * 6} y="16" width="3.5" height="32" rx="1.75" />
        ))}
      </>
    ),
    control: (
      <>
        <circle className="g-line" cx="22" cy="32" r="9" />
        <rect className="g-line" x="34" y="23" width="18" height="18" rx="3" />
        <circle className="g-dot g-switch" cx="22" cy="32" r="4" />
      </>
    ),
    timing: (
      <>
        <path className="g-line" d="M20 52 L32 12 L44 52 Z" />
        <g className="g-swing">
          <line className="g-stroke" x1="32" y1="46" x2="32" y2="18" />
          <circle className="g-dot" cx="32" cy="24" r="3.5" />
        </g>
      </>
    ),
    calm: (
      <>
        <circle className="g-breathe" cx="32" cy="32" r="14" />
        <circle className="g-line" cx="32" cy="32" r="22" />
      </>
    ),
  };
  return (
    <svg className={`ab-glyph glyph-${id} ${className ?? ''}`} viewBox="0 0 64 64" aria-hidden>
      {glyphs[id]}
    </svg>
  );
}
