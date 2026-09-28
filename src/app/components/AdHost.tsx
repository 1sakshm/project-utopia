import { useEffect, useRef, useState } from 'react';
import { useMockAd, type AdPlacement } from '@/platform/ads';

const SECONDS = 5;
const REWARD_TEXT: Record<AdPlacement, string> = {
  'double-orbs': 'Double your orbs',
  'second-chance': 'A second chance',
  boost: 'A free boost',
  shop: 'A free sample',
};

/** Mock rewarded-ad player (placeholder until a real ad network is approved). Always opt-in, clearly labelled. */
export default function AdHost() {
  const open = useMockAd((s) => s.open);
  const finish = useMockAd((s) => s.finish);
  const [left, setLeft] = useState(SECONDS);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setLeft(SECONDS);
    const t = window.setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (open && left === 0) btn.current?.focus();
  }, [open, left]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish('dismissed');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, finish]);

  if (!open) return null;
  const done = left === 0;
  const frac = (SECONDS - left) / SECONDS;
  return (
    <div className="ad-host" role="dialog" aria-modal="true" aria-label="Sponsored video">
      <div className="ad-card">
        <div className="ad-top">
          <span className="ad-label">Sponsored · Mock ad</span>
          <button className="ad-skip" onClick={() => finish('dismissed')}>
            {done ? 'Close' : 'Skip (no reward)'}
          </button>
        </div>
        <div className="ad-stage" aria-hidden>
          <div className="ad-orb" />
          <p className="ad-brand display">Your ad here</p>
          <p className="ad-sub">This is a placeholder for a real rewarded ad.</p>
        </div>
        <div className="ad-foot">
          <span className="ad-ring" style={{ ['--p' as string]: frac }}>
            <span>{done ? '✓' : left}</span>
          </span>
          <div className="ad-reward">
            <small>Reward</small>
            <b>{REWARD_TEXT[open]}</b>
          </div>
          <button ref={btn} className="btn btn-primary" disabled={!done} onClick={() => finish('rewarded')}>
            {done ? 'Collect ✨' : `Reward in ${left}s`}
          </button>
        </div>
      </div>
    </div>
  );
}
