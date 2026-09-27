import { useEffect, useState, type ReactNode } from 'react';
import { useSettings, prefersReducedMotion, type Settings as S } from '@/platform/settings';
import { useProgress } from '@/platform/progress';
import { track } from '@/platform/analytics';
import { audioEngine } from '@/runtime/audio';
import { navigate } from '../router';

type Opt<T> = ReadonlyArray<readonly [T, string]>;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set-group">
      <h2 className="section-title">{title}</h2>
      <div className="set-card">{children}</div>
    </section>
  );
}

function Toggle({ label, desc, k }: { label: string; desc?: string; k: keyof S }) {
  const v = useSettings((s) => s[k]) as boolean;
  const set = useSettings((s) => s.set);
  return (
    <label className="set-row">
      <span className="set-text">
        <span>{label}</span>
        {desc && <small>{desc}</small>}
      </span>
      <input
        type="checkbox"
        className="switch"
        checked={v}
        onChange={(e) => {
          set({ [k]: e.target.checked } as Partial<S>);
          track({ name: 'setting_changed', key: String(k), value: String(e.target.checked) });
        }}
      />
    </label>
  );
}

function Segmented<T extends string | number>({ label, desc, k, options }: { label: string; desc?: string; k: keyof S; options: Opt<T> }) {
  const v = useSettings((s) => s[k]) as unknown as T;
  const set = useSettings((s) => s.set);
  return (
    <div className="set-row set-col" role="group" aria-label={label}>
      <span className="set-text">
        <span>{label}</span>
        {desc && <small>{desc}</small>}
      </span>
      <div className="seg">
        {options.map(([val, l]) => (
          <button
            key={String(val)}
            aria-pressed={v === val}
            onClick={() => {
              set({ [k]: val } as Partial<S>);
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
    <label className="set-row">
      <span className="set-text">
        <span>{label}</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={v}
        onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<S>)}
        onPointerUp={() => {
          audioEngine.unlock();
          audioEngine.uiTap();
        }}
        aria-valuetext={`${Math.round(v * 100)}%`}
      />
      <span className="set-val">{Math.round(v * 100)}</span>
    </label>
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
  const s = useSettings();
  const clearAll = useProgress((x) => x.clearAll);
  const [canInstall, setCanInstall] = useState(!!deferredInstall);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
      history: useProgress.getState().history,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `utopia-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="page settings">
      <header className="page-head">
        <h1 className="display">Settings</h1>
        <p className="muted">Every setting applies to all games, instantly.</p>
      </header>

      <Group title="Visual">
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
            ['atkinson', 'Atkinson Hyperlegible'],
          ]}
        />
        <Segmented
          k="previewStyle"
          label="Feed previews"
          desc="Live previews use the real game; Still saves battery and data"
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
            ['battery', 'Battery saver'],
            ['high', 'High'],
          ]}
        />
        <Toggle k="showKeyHints" label="Show key hints in games" desc="Numbers on tappable objects where supported" />
      </Group>

      <Group title="Audio & haptics">
        <Slider k="master" label="Master volume" />
        <Slider k="music" label="Music" />
        <Slider k="sfx" label="Sound effects" />
        <Slider k="voice" label="Voice" />
        <Toggle k="feedSound" label="Sound in feed previews" desc="Off by default" />
        <Toggle k="mono" label="Mono audio" />
        <Toggle k="captions" label="Captions for sounds" desc="Show a short caption when a meaningful sound plays" />
        {'vibrate' in navigator && <Toggle k="haptics" label="Vibration" />}
      </Group>

      <Group title="Gameplay">
        <Segmented
          k="timing"
          label="Timing"
          desc="Slows response windows. “No time pressure” removes timers in games that support it."
          options={[
            ['standard', 'Standard'],
            ['relaxed15', 'Relaxed 1.5×'],
            ['relaxed2', 'Relaxed 2×'],
            ['none', 'No time pressure'],
          ]}
        />
        <Toggle k="resumeCountdown" label="Countdown when resuming" />
        <Toggle k="confirmExit" label="Confirm before exiting a long round" />
        <Toggle k="leftHanded" label="Left-handed layout" />
        <Toggle k="hideFastReaction" label="Move quick-reaction games to the end of the feed" />
        <Toggle k="hideAudioDependent" label="Move sound-dependent games to the end of the feed" />
      </Group>

      <Group title="Wellbeing">
        <Segmented
          k="breakReminderMin"
          label="Break reminders"
          desc="A gentle card in the feed — never interrupts a game"
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

      <Group title="Data & privacy">
        <Toggle k="analytics" label="Share anonymous product analytics" desc="Off by default. No trial-level data is ever collected." />
        <div className="set-row">
          <span className="set-text">
            <span>Your data stays on this device</span>
            <small>Progress is stored locally. Export it any time.</small>
          </span>
          <button className="btn" onClick={exportData}>
            Export JSON
          </button>
        </div>
        <div className="set-row">
          <span className="set-text">
            <span>Delete my data</span>
            <small>Removes all progress and history on this device</small>
          </span>
          {confirmDelete ? (
            <span className="row">
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  clearAll();
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
        </div>
        {canInstall && (
          <div className="set-row">
            <span className="set-text">
              <span>Install Utopia</span>
              <small>Add to your home screen; played games work offline</small>
            </span>
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
          </div>
        )}
        <div className="set-row">
          <span className="set-text">
            <span>Reset all settings</span>
          </span>
          <button className="btn" onClick={() => s.reset()}>
            Reset
          </button>
        </div>
      </Group>

      <Group title="About">
        <button className="set-row set-link" onClick={() => navigate('/about')}>
          <span className="set-text">
            <span>About Utopia · Science & claims</span>
            <small>What these games are — and aren’t</small>
          </span>
          <span aria-hidden>›</span>
        </button>
      </Group>
    </div>
  );
}
