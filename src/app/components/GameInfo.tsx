import type { GameManifest } from '@/sdk/types';
import { AbilityChip } from './Common';
import { ABILITY_LABEL } from '@/platform/abilities';

export function accessibilityTags(m: GameManifest): string[] {
  const t: string[] = [];
  if (m.accessibility.noTimePressure) t.push('No-time-pressure option');
  else if (m.accessibility.relaxedTiming) t.push('Relaxed timing option');
  if (m.accessibility.visualOnlyPlayable) t.push('Playable without sound');
  if (m.accessibility.audioOnlyPlayable) t.push('Playable by sound');
  if (m.accessibility.oneHanded) t.push('One-handed');
  if (m.input.requiresFastReaction) t.push('Needs quick reactions');
  if (m.input.requiresAudio) t.push('Best with sound');
  t.push('Color-independent');
  return t;
}

/** Full game information: used in the feed info sheet, desktop side panel and detail page. */
export function GameInfo({ m, compact = false }: { m: GameManifest; compact?: boolean }) {
  return (
    <div className="game-info">
      {!compact && <p className="gi-desc">{m.description}</p>}
      <section>
        <h3>How to play</h3>
        <ol className="gi-steps">
          {m.howTo.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>
      <section>
        <h3>Designed around</h3>
        <div className="gi-chips">
          <AbilityChip ability={m.abilities.primary} />
          {m.abilities.secondary?.map((a) => (
            <span key={a} className="chip chip-quiet">
              {ABILITY_LABEL[a]}
            </span>
          ))}
        </div>
      </section>
      <section>
        <h3>Controls</h3>
        <p className="gi-muted">Touch / mouse: {m.controls.touch}</p>
        <ul className="gi-keys">
          {m.controls.keyboard.map(([k, v]) => (
            <li key={k}>
              <kbd>{k}</kbd> {v}
            </li>
          ))}
          <li>
            <kbd>Esc</kbd> Pause
          </li>
        </ul>
      </section>
      <section>
        <h3>Accessibility</h3>
        <div className="gi-chips">
          {accessibilityTags(m).map((t) => (
            <span key={t} className="chip chip-quiet">
              {t}
            </span>
          ))}
        </div>
        {!compact && (
          <ul className="gi-notes">
            {m.accessibility.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>Science note</h3>
        <p className="gi-muted">
          <b>Inspired by:</b> {m.science.paradigm}. {m.science.note}
        </p>
        <p className="gi-fine">Playing games like this is practice, not treatment. Research on whether practice transfers to everyday skills is mixed.</p>
        {!compact && m.science.refs.length > 0 && (
          <ul className="gi-refs">
            {m.science.refs.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </section>
      {!compact && (
        <section>
          <h3>Credits</h3>
          <ul className="gi-refs">
            {m.credits.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
