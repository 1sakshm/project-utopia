import { track } from '@/platform/analytics';

/** Feedback form URL (e.g. a Tally or Google Form), set via VITE_FEEDBACK_URL. Hidden when unset. */
export const FEEDBACK_URL = (import.meta.env.VITE_FEEDBACK_URL as string | undefined) || '';

export function FeedbackButton({ from, className = 'btn' }: { from: string; className?: string }) {
  if (!FEEDBACK_URL) return null;
  return (
    <a className={className} href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" onClick={() => track({ name: 'feedback_click', from })}>
      💬 Share feedback
    </a>
  );
}
