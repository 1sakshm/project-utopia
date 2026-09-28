import type { VoiceLang } from '@/sdk';

/** Spoken digit words (index = digit). Spoken as words so each language reads them naturally. */
export const DIGIT_WORDS: Record<VoiceLang, string[]> = {
  'en-IN': ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
  'hi-IN': ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ'],
};

/** Short spoken cue before a backwards round. */
export const BACKWARDS_CUE: Record<VoiceLang, string> = {
  'en-IN': 'Backwards!',
  'hi-IN': 'उल्टा!',
};
