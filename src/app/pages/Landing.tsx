import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { GAMES } from '@/games/registry';
import { RINGS, ringOf, ABILITY_LABEL } from '@/platform/abilities';
import { track } from '@/platform/analytics';
import { navigate } from '../router';
import { AbilityGlyph, AbilityIcon, SectionHead, d, useReveal } from '../components/Editorial';
import { ABILITY_COPY } from './About';
import '@/styles/about.css';
import '@/styles/landing.css';

const CONTACT = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? '';
// The 10 games that speak (Sarvam AI voices) and/or listen (speech-to-text).
const VOICE_IDS = new Set(['word-echo', 'digit-echo', 'sound-sleuth', 'say-it-back', 'name-rush', 'story-shells', 'two-voices', 'luna-says', 'lingo-switch', 'voice-sprint']);
const SHOWCASE = ['echo-garden', 'lingo-switch', 'tidal-beat', 'lumen', 'still-water', 'word-echo', 'orbit-keeper', 'lantern-lake'].filter((id) => GAMES.some((g) => g.manifest.id === id));

const STEPS = [
  { n: '01', title: 'Swipe', body: 'A feed of live, playable previews. Each card is a tiny world.' },
  { n: '02', title: 'Tap Play', body: 'You’re in the game in about a second. No sign-up, no install.' },
  { n: '03', title: 'Come back', body: 'Exit lands you on the same card. A new daily challenge waits tomorrow.' },
];

const ACCESS = [
  ['Dyslexia-friendly font', 'Atkinson Hyperlegible, larger text, calm layouts.'],
  ['Relaxed timing', '1.5×, 2× or no time pressure in every game.'],
  ['High contrast', 'Stronger outlines and colours; nothing relies on colour alone.'],
  ['Captions for sounds', 'Every meaningful sound is also shown.'],
  ['Reduced motion', 'Follows your device, or switch it yourself.'],
  ['Speak or type', 'Voice games accept spoken or typed answers.'],
];

const FAQ: Array<[string, string]> = [
  ['Is it free?', 'Yes. Every game is free to play, with no sign-up. Optional rewards and cosmetics are earned by playing; ads are only ever shown if you choose to watch one for a reward.'],
  ['Does it make me smarter?', 'We don’t claim that. Each game is designed around an ability and inspired by published research, but it isn’t a treatment, a test or a “brain age”. It’s a better five minutes than endless scrolling.'],
  ['Does it work on my phone?', 'Yes, in any modern browser on Android, iPhone, tablets, Chromebooks and desktops. You can add it to your home screen, and games you’ve played work offline.'],
  ['What happens to my voice?', 'Voice games ask first. If you answer by microphone, the recording is sent to Sarvam AI to be turned into text and isn’t stored by Utopia. You can always type instead.'],
  ['Where is my progress saved?', 'On your device. There is no account. You can export or delete it from Settings at any time.'],
];

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  const voiceCount = GAMES.filter((g) => VOICE_IDS.has(g.manifest.id)).length;

  const play = (where: string) => {
    track({ name: 'landing_cta', where });
    navigate('/feed');
  };

  return (
    <div className="ed-page lp" ref={root}>
      {/* ---------- Hero ---------- */}
      <section className="lp-hero">
        <div className="ab-aurora" aria-hidden>
          <i className="b1" />
          <i className="b2" />
          <i className="b3" />
        </div>
        <div className="lp-hero-copy">
          <p className="ab-kicker ab-fade" style={d(0)}>
            <span className="ab-orb" aria-hidden /> Project Utopia
          </p>
          <h1 className="lp-title display ab-fade" style={d(1)}>
            Reels you <span className="ab-italic">play,</span>
            <br />
            not watch.
          </h1>
          <p className="lp-lead ab-fade" style={d(3)}>
            A feed of short, beautiful games, each designed around an ability like memory, focus, rhythm, language or calm. Swipe, tap, and you’re playing in a second.
          </p>
          <div className="lp-ctas ab-fade" style={d(4)}>
            <button className="btn btn-primary btn-lg" onClick={() => play('hero')}>
              ▶ Play free now
            </button>
            <a className="btn btn-lg" href="#how">
              How it works
            </a>
          </div>
          <ul className="lp-proof ab-fade" style={d(5)}>
            <li>
              <b>{GAMES.length}</b> games, and growing
            </li>
            <li>
              <b>{voiceCount}</b> voice games in English &amp; हिंदी
            </li>
            <li>
              <b>0</b> sign-ups needed
            </li>
          </ul>
        </div>
        <PhoneShowcase />
      </section>

      {/* ---------- Problem ---------- */}
      <section className="ab-section lp-problem">
        <div className="lp-split" data-reveal>
          <div>
            <p className="ab-eyebrow">Why</p>
            <h2 className="display lp-h2">
              Short-form feeds take your attention and give little back.
            </h2>
          </div>
          <div className="lp-split-body">
            <p>
              We kept the part people love about reels (swipe, instant, endless variety) and swapped passive watching for a minute of play that asks something of you.
            </p>
            <p>
              Most brain-game apps are dull, paywalled, English-only and built for typing. Utopia is beautiful first, free to play, accessible by default, and speaks Indian languages.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="ab-section" id="how">
        <SectionHead eyebrow="How it works" title="Three taps from bored to playing" />
        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <li key={s.n} className="ed-card lp-step" data-reveal style={d(i)}>
              <span className="lp-step-n display">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- Abilities ---------- */}
      <section className="ab-section">
        <SectionHead eyebrow="The games" title="Eight families of focus" sub="Every game is designed around one ability and inspired by a published research task. New games join them all the time." />
        <div className="ab-abilities">
          {RINGS.map((r, i) => {
            const n = GAMES.filter((g) => ringOf(g.manifest.abilities.primary).id === r.id).length;
            return (
              <article key={r.id} data-reveal className="ab-ability" style={{ ...d(i % 4), '--c': r.color } as CSSProperties}>
                <AbilityGlyph id={r.id} />
                <h3>
                  {r.label} <small className="lp-count">{n}</small>
                </h3>
                <p>{ABILITY_COPY[r.id]}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ---------- Voice ---------- */}
      <section className="ab-section">
        <div className="ed-card lp-voice" data-reveal>
          <div>
            <p className="ab-eyebrow">Voice games</p>
            <h2 className="display lp-h2">
              Games you can <span className="ab-italic">talk to.</span>
            </h2>
            <p className="lp-voice-body">
              The game speaks, you answer out loud, in English or Hindi. Built for people who’d rather speak than read or type, from kids to grandparents. Voices and speech recognition by Sarvam AI. Typing always works too.
            </p>
            <div className="lp-chips">
              {GAMES.filter((g) => VOICE_IDS.has(g.manifest.id))
                .slice(0, 6)
                .map((g) => (
                  <span key={g.manifest.id} className="lp-chip">
                    {g.manifest.title}
                  </span>
                ))}
            </div>
          </div>
          <div className="lp-wave" aria-hidden>
            {Array.from({ length: 23 }, (_, i) => (
              <i key={i} style={{ '--i': i } as CSSProperties} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Accessibility ---------- */}
      <section className="ab-section">
        <SectionHead eyebrow="Accessible by default" title="Set it once. Every game follows." />
        <ul className="lp-access">
          {ACCESS.map(([t, b], i) => (
            <li key={t} className="ed-card" data-reveal style={d(i % 3)}>
              <h3>{t}</h3>
              <p>{b}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Principles ---------- */}
      <section className="ab-section">
        <div className="lp-principles" data-reveal>
          {[
            ['No forced ads', 'Rewards are optional. Ads only play if you ask for one.'],
            ['No streak guilt', 'Daily quests, never punishments for missing a day.'],
            ['Honest science', 'Inspired by research, never sold as treatment.'],
            ['Yours', 'No account. Progress stays on your device.'],
          ].map(([t, b]) => (
            <div key={t}>
              <h3 className="display">{t}</h3>
              <p>{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Recognition ---------- */}
      <section className="ab-section">
        <SectionHead eyebrow="Recognition" title="Backed and recognised" />
        <ul className="lp-badges" data-reveal>
          <li>
            <b>Anthropic</b>
            <span>Claude for Startups program</span>
          </li>
          <li>
            <b>Infosys Springboard</b>
            <span>20 Under 20</span>
          </li>
          <li>
            <b>GUSEC × UNICEF</b>
            <span>Best project, National Children Innovation Challenge</span>
          </li>
          <li>
            <b>Sarvam AI</b>
            <span>Indian-language voice technology</span>
          </li>
        </ul>
      </section>

      {/* ---------- Partners ---------- */}
      <section className="ab-section">
        <div className="ed-card lp-partner" data-reveal>
          <div>
            <p className="ab-eyebrow">For schools, clinics &amp; care homes</p>
            <h2 className="display lp-h2">Bring Utopia to the people you support.</h2>
            <p>
              Calm, ad-free brain breaks for classrooms, special-education teams, therapists and eldercare, with accessibility built in and nothing to install. We’re looking for pilot partners.
            </p>
          </div>
          {CONTACT ? (
            <a className="btn btn-primary btn-lg" href={`mailto:${CONTACT}?subject=Utopia%20pilot`} onClick={() => track({ name: 'landing_cta', where: 'partner_email' })}>
              Talk to us
            </a>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => play('partner')}>
              Try it first
            </button>
          )}
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="ab-section">
        <SectionHead eyebrow="Questions" title="Good to know" />
        <div className="lp-faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="ed-card" data-reveal>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="lp-final" data-reveal>
        <span className="lp-final-orb" aria-hidden />
        <h2 className="display">
          Your next five minutes, <span className="ab-italic">better.</span>
        </h2>
        <button className="btn btn-primary btn-lg" onClick={() => play('footer')}>
          ▶ Play free now
        </button>
        <nav className="lp-foot" aria-label="More">
          <button className="btn btn-ghost" onClick={() => navigate('/about')}>
            About
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/library')}>
            All games
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/privacy')}>
            Privacy
          </button>
          <a className="btn btn-ghost" href="https://github.com/1sakshm/project-utopia" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </section>
    </div>
  );
}

/** A phone that cycles through real game posters with their ability labels. */
function PhoneShowcase() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % SHOWCASE.length), 2600);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="lp-phone-wrap" aria-hidden>
      <div className="lp-phone">
        <div className="lp-screen">
          {SHOWCASE.map((id, k) => {
            const m = GAMES.find((g) => g.manifest.id === id)!.manifest;
            const ring = ringOf(m.abilities.primary);
            return (
              <div key={id} className={`lp-slide ${k === i ? 'is-on' : ''}`} style={{ backgroundImage: `url(/posters/${id}.jpg)`, '--acc': m.palette.accent } as CSSProperties}>
                <div className="lp-slide-meta">
                  <span className="lp-slide-kicker">
                    <AbilityIcon id={ring.id} color={ring.color} size={16} /> {ABILITY_LABEL[m.abilities.primary]}
                    {VOICE_IDS.has(id) && <em> · voice</em>}
                  </span>
                  <b className="display">{m.title}</b>
                  <span className="lp-slide-play">▶ Play</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="lp-dots">
        {SHOWCASE.map((id, k) => (
          <i key={id} className={k === i ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}
