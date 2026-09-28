import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSettings, prefersReducedMotion, type Settings as S } from '@/platform/settings';
import { useProgress } from '@/platform/progress';
import { useEconomy, AD_DAILY_CAP } from '@/platform/economy';
import { track } from '@/platform/analytics';
import { audioEngine } from '@/runtime/audio';
import { navigate } from '../router';
import { Hero, SectionHead, useReveal } from '../components/Editorial';
import { FEEDBACK_URL, FeedbackButton } from '../components/Feedback';
import '@/styles/settings.css';

type Opt<T> = ReadonlyArray<readonly [T, string]>;

const GROUPS = [
  { id: 'visual', label: 'Visual', title: 'See it your way' },
  { id: 'audio', label: 'Audio & haptics', title: 'Sound and touch' },
  { id: 'gameplay', label: 'Gameplay', title: 'Play at your pace' },
  { id: 'voice', label: 'Voice', title: 'Speak and listen' },
  { id: 'rewards', label: 'Rewards', title: 'Orbs, boosts and ads' },
  { id: 'wellbeing', label: 'Wellbeing', title: 'Look after yourself' },
  { id: 'data', label: 'Data & privacy', title: 'Your data, your call' },
] as const;
type GroupId = (typeof GROUPS)[number]['id'];

function Group({ id, children }: { id: GroupId; children: ReactNode }) {
  const i = GROUPS.findIndex((g) => g.id === id);
  const g = GROUPS[i];
  return (
    <section className="ab-section set2-group" id={`set-${id}`}>
      <SectionHead index={i + 1} eyebrow={g.label} title={g.title} />
      <div className="ed-card set2-card" data-reveal>
        {children}
      </div>
    </section>
  );
}

function Toggle({ label, desc, k }: { label: string; desc?: string; k: keyof S }) {
  const v = useSettings((s) => s[k]) as boolean;
  const set = useSettings((s) => s.set);
  return (
    <label className="set2-row">
      <span className="set2-text">
        <span>{label}</span>
        {desc && <small>{desc}</small>}
      </span>
      <input
        type="checkbox"
        className="switch set2-switch"
        checked={v}
        onChange={(e) => {
          set({ [k]: e.target.checked } as Partial<S>);
          audioEngine.uiTap();
          track({ name: 'setting_changed', key: String(k), value: String(e.target.checked) });
        }}
      />
    </label>
  );
}

function Segmented<T extends string | number>({ label, desc, k, options }: { label: string; desc?: string; k: keyof S; options: Opt<T> }) {
  const v = useSettings((s) => s[k]) as unknown as T;
  const set = useSettings((s) => s.set);
  const idx = Math.max(0, options.findIndex(([val]) => val === v));
  return (
    <div className="set2-row set2-col" role="group" aria-label={label}>
      <span className="set2-text">
        <span>{label}</span>
        {desc && <small>{desc}</small>}
      </span>
      <div className="set2-seg" style={{ '--n': options.length, '--i': idx } as CSSProperties}>
        <span className="set2-seg-thumb" aria-hidden />
        {options.map(([val, l]) => (
          <button
            key={String(val)}
            aria-pressed={v === val}
            onClick={() => {
              set({ [k]: val } as Partial<S>);
              audioEngine.uiTap();
              track({ name: 'setting_changed', key: String(k), value: String(val) });
            }}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Slider({ label, k }: { label: string; k: 'master' | 'music' | 'sfx' | 'voice' }) {
  const v = useSettings((s) => s[k]);
  const set = useSettings((s) => s.set);
  return (
    <label className="set2-row">
      <span className="set2-text">
        <span>{label}</span>
      </span>
      <span className="set2-slider">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={v}
          style={{ '--v': `${v * 100}%` } as CSSProperties}
          onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<S>)}
          onPointerUp={() => {
            audioEngine.unlock();
            audioEngine.uiTap();
          }}
          aria-valuetext={`${Math.round(v * 100)}%`}
        />
        <span className="set2-val">{Math.round(v * 100)}</span>
      </span>
    </label>
  );
}

function ActionRow({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="set2-row">
      <span className="set2-text">
        <span>{label}</span>
        {desc && <small>{desc}</small>}
      </span>
      {children}
    </div>
  );
}

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
}
let deferredInstall: BIPEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e as BIPEvent;
});

export default function Settings() {
  const root = useRef<HTMLDivElement>(null);
  const s = useSettings();
  const clearAll = useProgress((x) => x.clearAll);
  const adsLeft = useEconomy((x) => x.adsLeft());
  const [canInstall, setCanInstall] = useState(!!deferredInstall);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useReveal(root);
  useEffect(() => {
    const on = () => setCanInstall(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      settings: Object.fromEntries(Object.entries(useSettings.getState()).filter(([, v]) => typeof v !== 'function')),
      progress: useProgress.getState().games,
      economy: Object.fromEntries(Object.entries(useEconomy.getState()).filter(([, v]) => typeof v !== 'function')),
      history: useProgress.getState().history,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `utopia-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const jump = (id: GroupId) => {
    document.getElementById(`set-${id}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="ed-page settings2" ref={root}>
      <Hero
        compact
        kicker="Settings"
        title="Make it"
        accent="yours."
        lead="Every setting applies to every game, instantly. Set it once and forget it."
        palette={['#ffb37a', '#b99cff', '#ff8fb1']}
      >
        <div className="ed-pills set2-jump" role="navigation" aria-label="Jump to a settings group">
          {GROUPS.map((g) => (
            <button key={g.id} className="ed-pill" onClick={() => jump(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      </Hero>

      <Group id="visual">
        <Toggle k="highContrast" label="High contrast" desc="Stronger outlines and colors, no fog or grain" />
        <Segmented
          k="reducedMotion"
          label="Reduced motion"
          desc={`Currently ${prefersReducedMotion(s) ? 'on' : 'off'}`}
          options={[
            ['system', 'System'],
            ['on', 'On'],
            ['off', 'Off'],
          ]}
        />
        <Segmented
          k="flashIntensity"
          label="Flash & pulse intensity"
          options={[
            ['normal', 'Normal'],
            ['reduced', 'Reduced'],
            ['none', 'None'],
          ]}
        />
        <Segmented
          k="textScale"
          label="Text size"
          options={[
            [1, '100%'],
            [1.25, '125%'],
            [1.5, '150%'],
            [2, '200%'],
          ]}
        />
        <Segmented
          k="readingFont"
          label="Reading font"
          options={[
            ['default', 'Default'],
            ['atkinson', 'Hyperlegible'],
          ]}
        />
        <Segmented
          k="previewStyle"
          label="Feed previews"
          desc="Live previews run the real game; Still saves battery and data"
          options={[
            ['auto', 'Auto'],
            ['live', 'Live'],
            ['still', 'Still'],
          ]}
        />
        <Segmented
          k="graphics"
          label="Graphics quality"
          options={[
            ['auto', 'Auto'],
            ['battery', 'Battery'],
            ['high', 'High'],
          ]}
        />
        <Toggle k="showKeyHints" label="Show key hints in games" desc="Numbers on tappable objects where supported" />
      </Group>

      <Group id="audio">
        <Slider k="master" label="Master volume" />
        <Slider k="music" label="Music" />
        <Slider k="sfx" label="Sound effects" />
        <Slider k="voice" label="Voice" />
        <Toggle k="feedSound" label="Sound in feed previews" desc="Off by default" />
        <Toggle k="mono" label="Mono audio" />
        <Toggle k="captions" label="Captions for sounds" desc="A short caption whenever a meaningful sound plays" />
        {'vibrate' in navigator && <Toggle k="haptics" label="Vibration" />}
      </Group>

      <Group id="gameplay">
        <Segmented
          k="timing"
          label="Timing"
          desc="Slows response windows. “None” removes timers in games that support it."
          options={[
            ['standard', 'Standard'],
            ['relaxed15', '1.5×'],
            ['relaxed2', '2×'],
            ['none', 'None'],
          ]}
        />
        <Toggle k="resumeCountdown" label="Countdown when resuming" />
        <Toggle k="confirmExit" label="Confirm before exiting a long round" />
        <Toggle k="leftHanded" label="Left-handed layout" />
        <Toggle k="hideFastReaction" label="Move quick-reaction games to the end of the feed" />
        <Toggle k="hideAudioDependent" label="Move sound-dependent games to the end of the feed" />
      </Group>

      <Group id="voice">
        <Segmented
          k="voiceLang"
          label="Voice language"
          desc="The language voice games speak and listen in"
          options={[
            ['en-IN', 'English'],
            ['hi-IN', 'हिन्दी'],
          ]}
        />
        <Segmented
          k="voiceGender"
          label="Game voice"
          options={[
            ['female', 'Female'],
            ['male', 'Male'],
          ]}
        />
        <Segmented
          k="voiceInput"
          label="Answer voice games by"
          desc="Microphone answers are sent to Sarvam AI to be turned into text and aren’t stored by Utopia"
          options={[
            ['ask', 'Ask me'],
            ['mic', 'Microphone'],
            ['typing', 'Typing'],
          ]}
        />
      </Group>

      <Group id="rewards">
        <Toggle k="showBoostPicker" label="Offer boosts before a game" desc="Slow-mo and Second Wind, paid with orbs or an optional ad. Boosted runs are scored separately." />
        <ActionRow
          label="Ads are optional"
          desc={`Only when you choose one, for a reward. Never forced, never needed to play. ${AD_DAILY_CAP - adsLeft} of ${AD_DAILY_CAP} watched today.`}
        >
          <button className="btn" onClick={() => navigate('/shop')}>
            Open shop
          </button>
        </ActionRow>
      </Group>

      <Group id="wellbeing">
        <Segmented
          k="breakReminderMin"
          label="Break reminders"
          desc="A gentle card in the feed that never interrupts a game"
          options={[
            [0, 'Off'],
            [20, '20 min'],
            [40, '40 min'],
          ]}
        />
        <Segmented
          k="weeklyGoalMin"
          label="Weekly practice goal"
          options={[
            [0, 'None'],
            [15, '15 min'],
            [30, '30 min'],
            [60, '60 min'],
          ]}
        />
      </Group>

      <Group id="data">
        <Toggle k="analytics" label="Share anonymous usage stats" desc="Helps Saksham see which games people enjoy and come back to. A random ID only: no names, emails, cookies or gameplay details." />
        <ActionRow label="Your data stays on this device" desc="Progress is stored locally. Export it any time.">
          <button className="btn" onClick={exportData}>
            Export JSON
          </button>
        </ActionRow>
        <ActionRow label="Delete my data" desc="Removes all progress, history, orbs and unlocks on this device">
          {confirmDelete ? (
            <span className="row">
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  clearAll();
                  useEconomy.getState().reset();
                  setConfirmDelete(false);
                }}
              >
                Delete
              </button>
            </span>
          ) : (
            <button className="btn" onClick={() => setConfirmDelete(true)}>
              Delete…
            </button>
          )}
        </ActionRow>
        {canInstall && (
          <ActionRow label="Install Utopia" desc="Add it to your home screen. Games you’ve played work offline.">
            <button
              className="btn btn-primary"
              onClick={async () => {
                await deferredInstall?.prompt();
                deferredInstall = null;
                setCanInstall(false);
              }}
            >
              Install
            </button>
          </ActionRow>
        )}
        <ActionRow label="Reset all settings">
          <button className="btn" onClick={() => s.reset()}>
            Reset
          </button>
        </ActionRow>
      </Group>

      <section className="ab-section">
        <button className="set2-about" data-reveal onClick={() => navigate('/about')}>
          <span className="set2-about-orb" aria-hidden />
          <span className="set2-about-text">
            <small>About Utopia</small>
            <b className="display">What these games are, and aren’t</b>
            <span>Made by Saksham Sharma (&amp; Claude ;p)</span>
          </span>
          <span className="set2-about-arrow" aria-hidden>
            →
          </span>
        </button>
        {FEEDBACK_URL && (
          <div className="set2-feedback" data-reveal>
            <p>
              <b>Tell me what you think.</b> What felt great, what felt hard, what you’d change. Every message is read.
            </p>
            <FeedbackButton from="settings" className="btn btn-primary" />
          </div>
        )}
      </section>
    </div>
  );
}
