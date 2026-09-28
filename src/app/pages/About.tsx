import { useRef, type CSSProperties } from 'react';
import { GAMES } from '@/games/registry';
import { RINGS, type RingId } from '@/platform/abilities';
import { AbilityGlyph, Hero, SectionHead, Stat, d, useReveal } from '../components/Editorial';
import '@/styles/about.css';

/** What each ability family is about — written to stay true as the library grows (no game names). */
export const ABILITY_COPY: Record<RingId, string> = {
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
  { title: 'Yours', body: 'Progress lives on your device, with no account needed. We count anonymous usage (no names, emails or cookies) to see what helps, and you can switch that off in Settings. Export or delete everything whenever you like.' },
];

export default function About() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  return (
    <div className="ed-page" ref={root}>
      <Hero
        back
        kicker="Project Utopia"
        title="Beautiful little games,"
        accent="honestly"
        tail="made."
        lead="Short, replayable games you discover like reels, each one designed around an ability like memory, attention, rhythm, planning, reading or calm focus."
      >
        <div className="ab-stats">
          <Stat value={GAMES.length} label="games, and growing" />
          <Stat value={RINGS.length} label="ability families" />
          <Stat value={0} label="ads, ever" />
        </div>
      </Hero>

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
