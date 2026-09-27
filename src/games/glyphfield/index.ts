import { defineGame } from '@/sdk';

export default defineGame({
  manifest: {
    id: 'glyphfield',
    version: '1.0.0',
    title: 'Glyphfield',
    hook: 'One rune matches the seal. Find it in the drift.',
    description:
      'A field of glowing runes drifts like plankton in deep water. Exactly one matches the seal — find it and tap it. Look-alikes share its strokes, some are turned or mirrored, and sometimes the rune isn’t there at all.',
    howTo: ['Study the rune in the seal', 'Tap its twin in the field', 'Streaks build a multiplier', 'No twin? Tap “Not here”'],
    controls: {
      touch: 'Tap the matching rune, or “Not here”',
      keyboard: [
        ['Arrows', 'Move focus between runes'],
        ['1–9', 'Jump to a field sector'],
        ['Space / Enter', 'Select focused rune'],
        ['N', 'Not here'],
      ],
    },
    abilities: { primary: 'selective-attention', secondary: ['visual-processing'] },
    engine: 'pixi',
    energy: 'focused',
    sessionLabel: '~3 min',
    input: { requiresAudio: false, requiresFastReaction: false },
    accessibility: {
      relaxedTiming: true,
      noTimePressure: true,
      visualOnlyPlayable: true,
      audioOnlyPlayable: false,
      oneHanded: true,
      notes: [
        'Runes differ only by shape, never by color',
        'No time pressure mode plays untimed rounds of 15 searches',
        'Larger text scale enlarges runes and thins the field',
        'Reduced motion keeps the field still',
      ],
    },
    palette: { bg: '#030f1c', bg2: '#0b2a3f', accent: '#6ff3e0', accent2: '#b69cff', highlight: '#eafffb' },
    science: {
      paradigm: 'Visual search (feature and conjunction search)',
      note: 'Designed around Treisman-style visual search: finding a target among look-alikes that share its features, which leans on focused, selective attention.',
      refs: ['Treisman, A. M., & Gelade, G. (1980). A feature-integration theory of attention. Cognitive Psychology.'],
    },
    scoreLabel: 'points',
    results: [
      { key: 'finds', label: 'Finds', better: 'higher' },
      { key: 'avgSearch', label: 'Average search', unit: 'ms', better: 'lower' },
      { key: 'bestStreak', label: 'Best streak', better: 'higher' },
    ],
    credits: ['Design & code: Saksham Sharma (& Claude)', 'All runes, art and sound procedurally generated'],
  },
  load: () => import('./game'),
});
