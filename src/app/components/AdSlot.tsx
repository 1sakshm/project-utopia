import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT, loadAdSense, slotId, type AdSlotId } from '@/platform/adsense';
import { track } from '@/platform/analytics';

/**
 * One responsive display ad. Renders nothing unless AdSense is configured for this placement, so there are never
 * empty boxes. Never shown inside a game.
 */
export function AdSlot({ slot }: { slot: AdSlotId }) {
  const id = slotId(slot);
  const ref = useRef<HTMLModElement>(null);
  useEffect(() => {
    if (!id || !ref.current) return;
    let cancelled = false;
    loadAdSense()
      .then(() => {
        if (cancelled || !ref.current || ref.current.dataset.adsbygoogleStatus) return;
        (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle.push({});
        track({ name: 'ad_impression', slot });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, slot]);
  if (!id) return null;
  return (
    <section className="section ad-wrap" aria-label="Advertisement">
      <span className="fine">Ad</span>
      <ins
        ref={ref}
        className="adsbygoogle ad-slot"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT!}
        data-ad-slot={id}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </section>
  );
}
