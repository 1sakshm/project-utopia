import type { VoiceLang } from '@/sdk';

export type Pair = [string, string];

/**
 * Minimal pairs by difficulty tier (all child-safe, real words):
 *  easy  = rhyming words whose first sounds are clearly different
 *  close = one consonant feature differs (voicing, aspiration, place: cap/cat, पल/फल)
 *  vowel = only the vowel differs (ship/sheep, कल/काल)
 */
export const PAIRS: Record<VoiceLang, { easy: Pair[]; close: Pair[]; vowel: Pair[] }> = {
  'en-IN': {
    easy: [
      ['cat', 'hat'], ['sun', 'fun'], ['man', 'fan'], ['book', 'look'], ['cake', 'lake'], ['ring', 'sing'],
      ['moon', 'soon'], ['rock', 'sock'], ['bed', 'red'], ['cap', 'map'], ['box', 'fox'], ['hill', 'mill'],
      ['dog', 'log'], ['pen', 'hen'], ['rose', 'nose'], ['wall', 'ball'],
    ],
    close: [
      ['cap', 'cat'], ['ship', 'sip'], ['bat', 'pat'], ['big', 'pig'], ['coat', 'goat'], ['fan', 'van'],
      ['thin', 'fin'], ['time', 'dime'], ['bear', 'pear'], ['tap', 'tab'], ['sock', 'shock'], ['sea', 'she'],
      ['three', 'free'], ['cold', 'gold'], ['mouse', 'mouth'], ['light', 'right'],
    ],
    vowel: [
      ['pen', 'pan'], ['bit', 'beat'], ['ship', 'sheep'], ['cup', 'cap'], ['full', 'fool'], ['bed', 'bad'],
      ['cot', 'cut'], ['pull', 'pool'], ['set', 'sat'], ['fill', 'feel'], ['not', 'nut'], ['luck', 'lock'],
      ['head', 'had'], ['sit', 'seat'], ['bag', 'beg'], ['hot', 'hat'],
    ],
  },
  'hi-IN': {
    easy: [
      ['मोर', 'चोर'], ['घर', 'पर'], ['पानी', 'रानी'], ['सेब', 'जेब'], ['आम', 'नाम'], ['गाय', 'चाय'],
      ['रात', 'बात'], ['बाल', 'गाल'], ['सोना', 'रोना'], ['मेला', 'केला'], ['नल', 'पल'], ['मन', 'धन'],
      ['हाथ', 'साथ'], ['कार', 'तार'],
    ],
    close: [
      ['पल', 'फल'], ['बाल', 'भाल'], ['दाल', 'ढाल'], ['ताल', 'थाल'], ['गाना', 'खाना'], ['पेड़', 'भेड़'],
      ['चाल', 'जाल'], ['फूल', 'भूल'], ['टाल', 'ताल'], ['डाल', 'दाल'], ['बात', 'भात'], ['सात', 'साथ'],
      ['चोर', 'छोर'], ['पूरी', 'भूरी'], ['कान', 'खान'],
    ],
    vowel: [
      ['कल', 'काल'], ['दिन', 'दीन'], ['सुर', 'सूर'], ['मिल', 'मील'], ['दल', 'दाल'], ['चल', 'चाल'],
      ['जल', 'जाल'], ['मन', 'मान'], ['कम', 'काम'], ['सर', 'सार'], ['बाल', 'बेल'], ['मेल', 'मोल'],
      ['पिला', 'पीला'], ['कुल', 'कूल'],
    ],
  },
};

export const UI: Record<VoiceLang, { listen: string; ask2: string; ask3: string; same: string; diff: string; odd: string }> = {
  'en-IN': {
    listen: 'LISTEN',
    ask2: 'SAME OR DIFFERENT?',
    ask3: 'WHICH ONE WAS DIFFERENT?',
    same: 'Same',
    diff: 'Different',
    odd: 'odd one',
  },
  'hi-IN': {
    listen: 'सुनो',
    ask2: 'एक जैसे या अलग?',
    ask3: 'कौन-सा अलग था?',
    same: 'एक जैसे',
    diff: 'अलग',
    odd: 'अलग',
  },
};
