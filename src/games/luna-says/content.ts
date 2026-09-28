import type { VoiceLang } from '@/sdk';

/** Shapes in button order: 0 star, 1 circle, 2 square, 3 triangle. Swipes: 0 up, 1 down, 2 left, 3 right. */
export interface LangPack {
  says: string;
  said: string;
  shapes: [string, string, string, string];
  labels: [string, string, string, string];
  tap: (shape: string) => string;
  dont: (shape: string) => string;
  then: (a: string, b: string) => string;
  swipe: [string, string, string, string];
  ui: {
    listen: string;
    go: string;
    held: string;
    oops: string;
    wrong: string;
    late: string;
    nice: string;
    swipeHint: string;
    first: string;
  };
}

export const PACK: Record<VoiceLang, LangPack> = {
  'en-IN': {
    says: 'Luna says',
    said: 'Luna said',
    shapes: ['star', 'circle', 'square', 'triangle'],
    labels: ['Star', 'Circle', 'Square', 'Triangle'],
    tap: (s) => `tap the ${s}`,
    dont: (s) => `don't tap the ${s}`,
    then: (a, b) => `tap the ${a}, then the ${b}`,
    swipe: ['swipe up', 'swipe down', 'swipe left', 'swipe right'],
    ui: {
      listen: 'LISTEN TO LUNA',
      go: 'YOUR MOVE',
      held: 'Well held!',
      oops: 'Luna didn’t say so!',
      wrong: 'Not that one',
      late: 'Too slow, try the next one',
      nice: 'Lovely!',
      swipeHint: 'Swipe ↑ ↓ ← → anywhere, or tap a shape',
      first: 'Only move when you hear “Luna says”',
    },
  },
  'hi-IN': {
    says: 'लूना कहती है',
    said: 'लूना ने कहा था',
    shapes: ['तारा', 'गोला', 'चौकोर', 'त्रिकोण'],
    labels: ['तारा', 'गोला', 'चौकोर', 'त्रिकोण'],
    tap: (s) => `${s} दबाओ`,
    dont: (s) => `${s} मत दबाओ`,
    then: (a, b) => `पहले ${a}, फिर ${b} दबाओ`,
    swipe: ['ऊपर स्वाइप करो', 'नीचे स्वाइप करो', 'बाएँ स्वाइप करो', 'दाएँ स्वाइप करो'],
    ui: {
      listen: 'लूना की बात सुनो',
      go: 'अब तुम्हारी बारी',
      held: 'शाबाश, तुम रुके रहे!',
      oops: 'लूना ने ऐसा नहीं कहा!',
      wrong: 'यह वाला नहीं',
      late: 'थोड़ी देर हो गई, अगली बार',
      nice: 'बहुत बढ़िया!',
      swipeHint: 'कहीं भी ↑ ↓ ← → स्वाइप करो, या आकार दबाओ',
      first: 'तभी करो जब सुनो “लूना कहती है”',
    },
  },
};
