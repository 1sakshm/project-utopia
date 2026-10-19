import { useEffect } from 'react';
import { ArrowRight, Play, Swords } from 'lucide-react';
import { GAMES } from '@/games/registry';
import { RINGS } from '@/platform/abilities';
import { VERSUS_ENABLED } from '@/platform/versus/config';
import { track } from '@/platform/analytics';
import { navigate } from '../router';
import { ABILITY_COPY } from './About';

const ACCESS: Array<[string, string]> = [
  ['Dyslexia-friendly font', 'Atkinson Hyperlegible, larger text, calm layouts.'],
  ['Relaxed timing', '1.5×, 2× or no time pressure in every game.'],
  ['High contrast', 'Stronger outlines; nothing relies on colour alone.'],
  ['Captions for sounds', 'Every meaningful sound is also shown.'],
  ['Reduced motion', 'Follows your device, or switch it yourself.'],
  ['Speak or type', 'Voice games accept spoken or typed answers.'],
];

const FAQ: Array<[string, string]> = [
  ['Is it free?', 'Yes. Every game is free, with no sign-up. Rewards and cosmetics are earned by playing. Ads never appear inside a game.'],
  ['How does Versus work?', 'You and your opponent get the same game with the same layout at the same moment. Scores update live, and the highest score wins. Play a stranger, a friend with a link, or a party of up to eight.'],
  ['Does it make me smarter?', 'We don’t claim that. Each game is designed around an ability and inspired by published research, but it isn’t a treatment, a test or a “brain age”.'],
  ['Does it work on my phone?', 'Yes, in any modern browser on phones, tablets, Chromebooks and desktops. Add it to your home screen and games you’ve played work offline.'],
  ['Where is my progress saved?', 'On your device. There’s no account. Export or delete it from Settings any time.'],
];

/** Public landing page (/welcome). */
export default function Landing() {
  useEffect(() => {
    document.title = 'Utopia: short games for focus, memory and calm';
    return () => {
      document.title = 'Utopia';
    };
  }, []);
  const go = (to: string, where: string) => {
    track({ name: 'landing_cta', where });
    navigate(to);
  };

  return (
    <div className="page lp">
      <header className="lp-hero">
        <span className="brand-mark lp-mark" aria-hidden>
          u
        </span>
        <h1>Short games that train focus, memory and calm.</h1>
        <p className="lp-lead">
          {GAMES.length} quick games you swipe through like reels, each built around one ability. Play alone, or race someone live. Free, no sign-up, made to be
          accessible.
        </p>
        <div className="row">
          <button className="btn btn-primary btn-lg" onClick={() => go('/feed', 'hero')}>
            <Play size={16} fill="currentColor" /> Play now
          </button>
          {VERSUS_ENABLED && (
            <button className="btn btn-lg" onClick={() => go('/versus', 'hero_versus')}>
              <Swords size={16} /> Play someone
            </button>
          )}
        </div>
      </header>

      <ul className="lp-posters" aria-hidden>
        {GAMES.slice(0, 6).map((g) => (
          <li key={g.manifest.id} style={{ backgroundImage: `url(/posters/${g.manifest.id}.jpg)` }} />
        ))}
      </ul>

      <section className="section">
        <div className="lp-grid3">
          <div>
            <h3>Swipe</h3>
            <p>Every card is a live, playable preview. Tap Play and you’re in within a second.</p>
          </div>
          <div>
            <h3>Versus</h3>
            <p>Same game, same layout, same moment. Live scores, ratings and rematches.</p>
          </div>
          <div>
            <h3>Today’s 3</h3>
            <p>Three games picked for everyone each day. Missing a day costs nothing.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Eight abilities</h2>
        </div>
        <ul className="list">
          {RINGS.map((r) => (
            <li key={r.id} className="item">
              <span className="ab-dot" style={{ background: r.color }} aria-hidden />
              <span className="item-body">
                <span className="item-title">{r.label}</span>
                <span className="item-sub lp-wrap">{ABILITY_COPY[r.id]}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Accessible by default</h2>
        </div>
        <div className="lp-grid2">
          {ACCESS.map(([t, d]) => (
            <div key={t}>
              <b>{t}</b>
              <span>{d}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Questions</h2>
        </div>
        <div className="list lp-faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section lp-final">
        <button className="btn btn-primary btn-lg" onClick={() => go('/feed', 'final')}>
          Start playing <ArrowRight size={16} />
        </button>
        <p className="fine">
          Not a medical device. <a href="/privacy" onClick={(e) => (e.preventDefault(), navigate('/privacy'))}>Privacy &amp; terms</a>
        </p>
      </section>
    </div>
  );
}
