import type { Ability } from '@/sdk/types';

export type RingId = 'memory' | 'attention' | 'perception' | 'reasoning' | 'language' | 'control' | 'timing' | 'calm';

export const ABILITY_LABEL: Record<Ability, string> = {
  'working-memory': 'Working memory',
  'spatial-memory': 'Spatial memory',
  'selective-attention': 'Selective attention',
  'sustained-attention': 'Sustained attention',
  'divided-attention': 'Divided attention',
  'visual-processing': 'Visual processing',
  'spatial-reasoning': 'Spatial reasoning',
  'pattern-recognition': 'Pattern recognition',
  'phonological-awareness': 'Phonological awareness',
  'reading-fluency': 'Reading fluency',
  'cognitive-flexibility': 'Cognitive flexibility',
  inhibition: 'Inhibition',
  'reaction-timing': 'Reaction timing',
  'visuomotor-coordination': 'Coordination',
  planning: 'Planning',
  'rhythm-timing': 'Rhythm',
  'calm-attention': 'Calm attention',
};

export const ABILITY_RING: Record<Ability, RingId> = {
  'working-memory': 'memory',
  'spatial-memory': 'memory',
  'selective-attention': 'attention',
  'sustained-attention': 'attention',
  'divided-attention': 'attention',
  'visual-processing': 'perception',
  'spatial-reasoning': 'perception',
  'pattern-recognition': 'reasoning',
  planning: 'reasoning',
  'phonological-awareness': 'language',
  'reading-fluency': 'language',
  'cognitive-flexibility': 'control',
  inhibition: 'control',
  'reaction-timing': 'timing',
  'visuomotor-coordination': 'timing',
  'rhythm-timing': 'timing',
  'calm-attention': 'calm',
};

export const RINGS: Array<{ id: RingId; label: string; color: string; glyph: string }> = [
  { id: 'memory', label: 'Memory', color: '#b99cff', glyph: 'M' },
  { id: 'attention', label: 'Attention', color: '#6fe3ff', glyph: 'A' },
  { id: 'perception', label: 'Perception', color: '#ffd36b', glyph: 'P' },
  { id: 'reasoning', label: 'Reasoning & Planning', color: '#8dffb0', glyph: 'R' },
  { id: 'language', label: 'Language', color: '#ff9fb8', glyph: 'L' },
  { id: 'control', label: 'Flexibility & Control', color: '#ffae7a', glyph: 'F' },
  { id: 'timing', label: 'Timing & Coordination', color: '#7aa8ff', glyph: 'T' },
  { id: 'calm', label: 'Calm', color: '#9ee6d0', glyph: 'C' },
];

export const ringOf = (a: Ability) => RINGS.find((r) => r.id === ABILITY_RING[a])!;

/** Editorial base order: alternates abilities, energy and engine. */
export const EDITORIAL_ORDER = [
  'echo-garden',
  'firefly-night',
  'lantern-lake',
  'tidal-beat',
  'stonepath',
  'glyphfield',
  'zenith',
  'rhyme-tide',
  'silhouette',
  'upstream',
  'still-water',
  'word-current',
  'starback',
  'night-harbor',
  'lumen',
  'glimpse',
  'shoal',
  'orbit-keeper',
  'prism-sort',
  'loom',
];
