// Shared DOM widgets for voice games (engine-agnostic). Import from '@/sdk/voiceui'.
import type { GameContext, VoiceLang } from './types';
import { LANG_LABEL } from './speech';

export interface AnswerBar {
  /** Wait for one answer: a spoken transcript (mic) or typed text. Resolves '' if skipped/nothing heard. */
  ask(opts?: { prompt?: string; maxMs?: number }): Promise<string>;
  /** Cancel a pending ask (resolves it with ''). */
  cancel(): void;
  setHint(text: string): void;
  show(): void;
  hide(): void;
  /** 'mic' | 'typing' (can change if the mic fails or the player switches). */
  mode(): 'mic' | 'typing';
  destroy(): void;
}

/**
 * Bottom answer bar: a big mic button with a live level ring (tap to speak, auto-stops on silence) or a text field.
 * Handles consent (ctx.voice.inputMode), mic failure → typing, keyboard (Enter to submit, Space to talk),
 * and captions. Not shown in preview mode (returns a no-op bar).
 */
export function createAnswerBar(ctx: GameContext, opts: { placeholder?: string; submitLabel?: string } = {}): AnswerBar {
  if (ctx.mode === 'preview') {
    return { ask: async () => '', cancel() {}, setHint() {}, show() {}, hide() {}, mode: () => 'typing', destroy() {} };
  }
  const root = document.createElement('div');
  root.className = 'u-answer';
  root.innerHTML = `
    <p class="u-answer-hint" aria-live="polite"></p>
    <div class="u-answer-mic">
      <button class="u-mic" type="button" aria-label="Tap to speak your answer">
        <span class="u-mic-ring"></span><span class="u-mic-icon" aria-hidden="true">🎙️</span>
      </button>
      <button class="u-answer-switch" type="button">Type instead</button>
    </div>
    <form class="u-answer-type" hidden>
      <input class="u-answer-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" />
      <button class="u-answer-go" type="submit"></button>
      <button class="u-answer-switch2" type="button">🎙️</button>
    </form>`;
  ctx.container.appendChild(root);
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const hint = $<HTMLParagraphElement>('.u-answer-hint');
  const micWrap = $<HTMLDivElement>('.u-answer-mic');
  const mic = $<HTMLButtonElement>('.u-mic');
  const ring = $<HTMLSpanElement>('.u-mic-ring');
  const form = $<HTMLFormElement>('.u-answer-type');
  const input = $<HTMLInputElement>('.u-answer-input');
  $<HTMLButtonElement>('.u-answer-go').textContent = opts.submitLabel ?? 'Enter';
  input.placeholder = opts.placeholder ?? 'Type your answer';

  let mode: 'mic' | 'typing' = 'typing';
  let resolver: ((s: string) => void) | null = null;
  let listening = false;
  let maxMs = 7000;
  let modeKnown = false;

  const setMode = (m: 'mic' | 'typing') => {
    mode = m;
    micWrap.hidden = m !== 'mic';
    form.hidden = m !== 'typing';
    if (m === 'typing' && resolver) setTimeout(() => input.focus(), 30);
  };
  const deliver = (s: string) => {
    const r = resolver;
    resolver = null;
    root.classList.remove('is-asking');
    r?.(s);
  };
  const doListen = async () => {
    if (listening || !resolver) return;
    listening = true;
    mic.classList.add('is-listening');
    hint.dataset.prev = hint.textContent ?? '';
    hint.textContent = 'Listening…';
    const text = await ctx.voice.listen({ maxMs, onLevel: (l) => ring.style.setProperty('--lvl', l.toFixed(2)) });
    listening = false;
    mic.classList.remove('is-listening');
    ring.style.setProperty('--lvl', '0');
    if (text === null) {
      hint.textContent = 'Microphone unavailable, so please type your answer.';
      setMode('typing');
      return;
    }
    hint.textContent = hint.dataset.prev ?? '';
    if (text === '') {
      hint.textContent = 'Didn’t catch that. Tap the mic and try again.';
      return;
    }
    ctx.caption(`You said: “${text}”`);
    deliver(text);
  };
  mic.addEventListener('click', () => void doListen());
  $<HTMLButtonElement>('.u-answer-switch').addEventListener('click', () => setMode('typing'));
  $<HTMLButtonElement>('.u-answer-switch2').addEventListener('click', () => setMode('mic'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!resolver) return;
    const v = input.value.trim();
    input.value = '';
    deliver(v);
  });
  window.addEventListener(
    'keydown',
    (e) => {
      if (mode === 'mic' && e.code === 'Space' && resolver && !ctx.isPaused() && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        void doListen();
      }
    },
    { signal: ctx.signal },
  );
  ctx.signal.addEventListener('abort', () => root.remove());

  return {
    async ask(o) {
      if (!modeKnown) {
        setMode(await ctx.voice.inputMode());
        modeKnown = true;
      }
      if (o?.prompt !== undefined) hint.textContent = o.prompt;
      maxMs = o?.maxMs ?? 7000;
      root.classList.add('is-asking');
      if (mode === 'typing') setTimeout(() => input.focus(), 30);
      return new Promise<string>((res) => (resolver = res));
    },
    cancel: () => deliver(''),
    setHint: (t) => (hint.textContent = t),
    show: () => (root.hidden = false),
    hide: () => (root.hidden = true),
    mode: () => mode,
    destroy: () => root.remove(),
  };
}

/**
 * Small language toggle chip (English / हिन्दी) for the top-right of a game. Calls onChange after switching.
 * Hidden in preview mode.
 */
export function createLangToggle(ctx: GameContext, onChange?: (l: VoiceLang) => void): { destroy(): void } {
  if (ctx.mode === 'preview') return { destroy() {} };
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'u-lang';
  const render = () => {
    const l = ctx.voice.lang();
    b.textContent = l === 'en-IN' ? 'EN · हि' : 'हि · EN';
    b.setAttribute('aria-label', `Voice language: ${LANG_LABEL[l]}. Tap to switch.`);
  };
  b.addEventListener('click', () => {
    const next: VoiceLang = ctx.voice.lang() === 'en-IN' ? 'hi-IN' : 'en-IN';
    ctx.voice.setLang(next);
    render();
    onChange?.(next);
  });
  render();
  ctx.container.appendChild(b);
  ctx.signal.addEventListener('abort', () => b.remove());
  return { destroy: () => b.remove() };
}
