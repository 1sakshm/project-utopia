// Shared page primitives: a one-line page header, section heads, count-up numbers and ability glyphs.
// (Kept under the old names so every page shares one quiet, flat language.)
import { useEffect, useState, type CSSProperties, type DependencyList, type ReactNode } from 'react';
import type { RingId } from '@/platform/abilities';
import { prefersReducedMotion } from '@/platform/settings';
import { navigate } from '../router';
import { ChevronLeft } from 'lucide-react';

/** Kept for callers that pass stagger styles; the flat design doesn't stagger. */
export const d = (_i: number, _step = 90) => ({}) as CSSProperties;

/** No-op: content is shown immediately (no scroll-reveal choreography). */
export function useReveal(_root: React.RefObject<HTMLElement | null>, _deps: DependencyList = []) {}

/** Back button used on secondary pages. */
export function BackButton({ to = '/you' }: { to?: string }) {
  return (
    <button className="icon-btn" aria-label="Back" onClick={() => (window.history.length > 1 ? window.history.back() : navigate(to))}>
      <ChevronLeft />
    </button>
  );
}

/**
 * Page header. The old aurora hero's props are still accepted: `title + accent + tail` join into one plain title,
 * `lead` becomes a single muted line, and `children` render below.
 */
export function Hero({
  title,
  accent,
  tail,
  lead,
  back = false,
  children,
}: {
  kicker?: string;
  title: string;
  accent?: string;
  tail?: string;
  lead?: ReactNode;
  compact?: boolean;
  back?: boolean;
  palette?: [string, string, string];
  children?: ReactNode;
}) {
  const text = [title, accent, tail].filter(Boolean).join(' ').replace(/\s+([.,!?])/g, '$1');
  return (
    <header>
      <div className="topbar">
        {back && <BackButton />}
        <h1>{text}</h1>
      </div>
      {lead && <p className="page-sub">{lead}</p>}
      {children && <div style={{ marginBottom: 18 }}>{children}</div>}
    </header>
  );
}

export function SectionHead({ title, sub, right }: { eyebrow?: string; title: string; sub?: ReactNode; index?: number; right?: ReactNode }) {
  return (
    <>
      <div className="section-head">
        <h2>{title}</h2>
        {right}
      </div>
      {sub && <p className="section-sub">{sub}</p>}
    </>
  );
}

/** Number that counts up from 0 when first rendered (instant under reduced motion). */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown.toLocaleString()}</>;
}

export function Stat({ value, label }: { value: number | string; label: string; animate?: boolean }) {
  return (
    <div>
      <b>{value}</b>
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
 * Small ability badge: tinted square + mini glyph.
 * Static, so long lists stay calm.
 */
export function AbilityIcon({ id, color, size = 18 }: { id: RingId; color: string; live?: boolean; size?: number }) {
  return (
    <span className="ab-icon" style={{ '--c': color, '--s': `${size}px` } as CSSProperties} aria-hidden>
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
