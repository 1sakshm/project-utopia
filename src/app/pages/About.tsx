import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { GAMES } from '@/games/registry';
import { RINGS, type RingId } from '@/platform/abilities';
import { prefersReducedMotion } from '@/platform/settings';
import { navigate } from '../router';
import { IconBack } from '../components/Icons';
import '@/styles/about.css';

/** What each ability family is about — written to stay true as the library grows (no game names). */
const ABILITY_COPY: Record<RingId, string> = {
  memory: 'Holding things in mind: sequences, places, what came just before.',
  attention: 'Finding the signal, staying with it, following many things at once.',
  perception: 'Seeing quickly and turning shapes over in your mind’s eye.',
  reasoning: 'Spotting hidden rules and thinking a few moves ahead.',
  language: 'Hearing the sounds inside words and reading with ease.',
  control: 'Switching rules on the fly and stopping yourself mid-motion.',
  timing: 'Rhythm, anticipation and a steady hand.',
  calm: 'A slower kind of focus. Breathe, notice, return.',
};

const PRINCIPLES: Array<{ title: string; body: string }> = [
  { title: 'Play in a second', body: 'No sign-up, no menus to wade through. Swipe, tap Play, and you’re in. Tap Exit and you’re exactly where you left off.' },
  {
    title: 'Honest about the science',
    body: 'Every game is designed around an ability and inspired by real research. None of them diagnose, treat or measure you. There’s no “brain age”, just your own personal bests.',
  },
  { title: 'Respectful of your attention', body: 'No ads, no currencies, no streak guilt, no notifications. The feed ends instead of scrolling forever, and gentle break reminders never interrupt a game.' },
  { title: 'Accessible by default', body: 'High contrast, reduced motion, relaxed timing, captions for sounds, keyboard play and big touch targets, set once and applied to every game.' },
  { title: 'Yours', body: 'Progress lives on your device. Analytics are off unless you turn them on. Export or delete everything whenever you like.' },
];

/** Adds `.is-in` to [data-reveal] elements as they scroll into view. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>('[data-reveal]'));
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
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [root]);
}

/** Gentle pointer parallax for the hero (writes --mx/--my in -1..1). */
function useParallax(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
}

const d = (i: number) => ({ '--d': `${i * 90}ms` }) as CSSProperties;

function Words({ text, start = 0 }: { text: string; start?: number }) {
  return (
    <>
      {/* spaces live outside the inline-block spans (trailing spaces inside them collapse) */}
      {text.split(' ').map((w, i) => (
        <span key={i}>
          <span className="ab-word" style={d(start + i)}>
            {w}
          </span>{' '}
        </span>
      ))}
    </>
  );
}

export default function About() {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  useReveal(root);
  useParallax(hero);
  const games = GAMES.length;

  return (
    <div className="about2" ref={root}>
      <section className="ab-hero" ref={hero}>
        <div className="ab-aurora" aria-hidden>
          <i className="b1" />
          <i className="b2" />
          <i className="b3" />
        </div>
        <div className="ab-motes" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <div className="ab-grain" aria-hidden />

        <button className="btn btn-ghost ab-back" onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/settings'))}>
          <IconBack width={18} height={18} /> Back
        </button>

        <div className="ab-hero-inner">
          <p className="ab-kicker">
            <span className="ab-orb" aria-hidden /> Project Utopia
          </p>
          <h1 className="ab-title display">
            <Words text="Beautiful little games," />
            <span className="ab-word ab-italic" style={d(3)}>
              honestly
            </span>{' '}
            <span className="ab-word" style={d(4)}>
              made.
            </span>
          </h1>
          <p className="ab-lead ab-fade" style={d(7)}>
            Short, replayable games you discover like reels, each one designed around an ability like memory, attention,
            rhythm, planning, reading or calm focus.
          </p>
          <div className="ab-stats ab-fade" style={d(9)}>
            <Stat value={games} label="games, and growing" />
            <Stat value={RINGS.length} label="ability families" />
            <Stat value={0} label="ads, ever" />
          </div>
        </div>
        <div className="ab-scroll-cue" aria-hidden>
          <span />
        </div>
      </section>

      <section className="ab-section">
        <SectionHead eyebrow="What we believe" title="Five small promises" />
        <ol className="ab-principles">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} data-reveal className="ab-principle" style={d(i % 2)}>
              <span className="ab-num display">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="ab-section">
        <SectionHead eyebrow="The abilities" title="Eight families of focus" sub="Every game belongs to one. New games join them as the library grows." />
        <div className="ab-abilities">
          {RINGS.map((r, i) => (
            <article key={r.id} data-reveal className="ab-ability" style={{ ...d(i % 4), '--c': r.color } as CSSProperties}>
              <AbilityGlyph id={r.id} />
              <h3>{r.label}</h3>
              <p>{ABILITY_COPY[r.id]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ab-section">
        <SectionHead eyebrow="The fine print, in plain words" title="What this is, and isn’t" />
        <div className="ab-isnt" data-reveal>
          <div className="ab-col is">
            <h3>Utopia is</h3>
            <ul>
              <li>Games designed around real cognitive abilities</li>
              <li>Inspired by research paradigms, cited in each game</li>
              <li>A better use of five minutes than endless scrolling</li>
            </ul>
          </div>
          <div className="ab-col isnt">
            <h3>Utopia isn’t</h3>
            <ul>
              <li>A medical device, diagnosis or treatment</li>
              <li>An IQ test or a “brain age” score</li>
              <li>A promise that practice transfers to everyday life</li>
            </ul>
          </div>
        </div>
        <p className="ab-footnote" data-reveal>
          Research on whether practice transfers to everyday skills is mixed (Simons et al., 2016, <i>Psychological Science in the Public Interest</i>). We make
          these games because they’re fun and beautiful, and we’re honest about the rest.
        </p>
      </section>

      <section className="ab-credit" data-reveal>
        <p className="ab-kicker">Made by</p>
        <h2 className="ab-signature display">
          Saksham Sharma
          <svg className="ab-underline" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden>
            <path d="M6 28 C 70 8, 130 36, 200 20 S 330 6, 394 22" />
          </svg>
        </h2>
        <p className="ab-and">
          <span>&amp; Claude</span> <span className="ab-wink">;p</span>
        </p>
        <p className="ab-credit-fine">
          Every shape, texture and sound in these games is generated right in your browser, with no stock art. Typefaces: Fraunces, Manrope and Atkinson
          Hyperlegible (SIL Open Font License). Built with React, Three.js and PixiJS.
        </p>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="ab-stat">
      <span className="display">{value}</span>
      <small>{label}</small>
    </div>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <header className="ab-head" data-reveal>
      <p className="ab-eyebrow">{eyebrow}</p>
      <h2 className="display">{title}</h2>
      {sub && <p className="ab-sub">{sub}</p>}
    </header>
  );
}

/** Small animated glyph per ability family (pure SVG + CSS). */
function AbilityGlyph({ id }: { id: RingId }) {
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
    <svg className={`ab-glyph glyph-${id}`} viewBox="0 0 64 64" aria-hidden>
      {glyphs[id]}
    </svg>
  );
}
