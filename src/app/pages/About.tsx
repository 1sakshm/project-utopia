import { GAMES } from '@/games/registry';
import { RINGS, ABILITY_LABEL, ABILITY_RING } from '@/platform/abilities';
import { navigate } from '../router';
import { IconBack } from '../components/Icons';

export default function About() {
  return (
    <div className="page about">
      <button className="btn btn-ghost back" onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/settings'))}>
        <IconBack width={18} height={18} /> Back
      </button>
      <header className="page-head">
        <p className="eyebrow">Project Utopia</p>
        <h1 className="display">Beautiful little games, honestly made.</h1>
        <p className="lead">
          Utopia is a collection of short, replayable games — each designed around an ability like working memory, attention, rhythm,
          planning, reading, or calm focus. Discover them like reels; play in a second; come back to exactly where you were.
        </p>
      </header>

      <section className="prose">
        <h2 className="section-title">What these games are — and aren’t</h2>
        <p>
          Every game is <b>designed around</b> a cognitive ability and inspired by a research paradigm (you’ll find it in each game’s
          info sheet). Utopia is <b>not</b> a medical device. It doesn’t diagnose, treat, cure or prevent any condition, and it
          doesn’t measure your intelligence. There is no “brain age” and no comparison with other people — only your own
          personal bests.
        </p>
        <p>
          Playing games like these is practice, not treatment. Research on whether practice transfers to everyday skills is mixed
          (see Simons et al., 2016, <i>Psychological Science in the Public Interest</i>). We think they’re worth playing because they’re
          fun, beautiful and a better use of a few minutes than endless scrolling.
        </p>
        <h2 className="section-title">Respecting your attention</h2>
        <ul>
          <li>No ads, no currencies, no streak guilt, no push notifications.</li>
          <li>The feed is finite: it ends, instead of scrolling forever.</li>
          <li>Preview sound is off by default; games never autoplay.</li>
          <li>Gentle break reminders (adjustable in Settings) — never mid-game.</li>
          <li>Your progress stays on your device. Analytics are off unless you turn them on.</li>
        </ul>
        <h2 className="section-title">Accessible by default</h2>
        <p>
          Every game avoids color-only information, supports high contrast, reduced motion, relaxed timing, captions for sounds,
          keyboard play and large touch targets. Settings apply to every game at once.
        </p>
      </section>

      <section>
        <h2 className="section-title">Ability glossary</h2>
        <div className="glossary">
          {RINGS.map((r) => {
            const games = GAMES.filter((g) => ABILITY_RING[g.manifest.abilities.primary] === r.id);
            return (
              <div key={r.id} className="gloss-card">
                <h3>
                  <span className="chip-glyph" style={{ background: r.color }} aria-hidden>
                    {r.glyph}
                  </span>{' '}
                  {r.label}
                </h3>
                <ul>
                  {games.map((g) => (
                    <li key={g.manifest.id}>
                      <button className="linkish" onClick={() => navigate(`/game/${g.manifest.id}`)}>
                        {g.manifest.title}
                      </button>{' '}
                      <span className="muted">— {ABILITY_LABEL[g.manifest.abilities.primary]}; {g.manifest.science.paradigm}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="prose">
        <h2 className="section-title">Credits</h2>
        <p>
          Design, code, art and sound by the Utopia team. All game art, geometry, textures and sounds are generated procedurally in
          your browser — no third-party art assets are used. Typefaces: Fraunces, Manrope and Atkinson Hyperlegible (SIL Open Font
          License). Built with React, Three.js / React Three Fiber and PixiJS.
        </p>
      </section>
    </div>
  );
}
