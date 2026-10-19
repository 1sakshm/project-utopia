// Google AdSense: display units (AdSlot) and the H5 Games rewarded API (ads.ts) share one script.
// Configure at build time:
//   VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX     your publisher id (required for any ad)
//   VITE_ADSENSE_SLOT_HOME=1234567890                a display ad unit id per placement (optional)
//   VITE_ADSENSE_SLOT_GAMES=...  VITE_ADSENSE_SLOT_VERSUS=...
//   VITE_ADS_PROVIDER=h5                             also turn on rewarded ads (H5 Games Ads)
// With no client id nothing is loaded and no ad space is reserved.

export const ADSENSE_CLIENT = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined)?.trim() || null;

export type AdSlotId = 'home' | 'games' | 'versus';

const SLOTS: Record<AdSlotId, string | undefined> = {
  home: import.meta.env.VITE_ADSENSE_SLOT_HOME as string | undefined,
  games: import.meta.env.VITE_ADSENSE_SLOT_GAMES as string | undefined,
  versus: import.meta.env.VITE_ADSENSE_SLOT_VERSUS as string | undefined,
};

export const slotId = (s: AdSlotId) => (ADSENSE_CLIENT ? SLOTS[s]?.trim() || null : null);

let loading: Promise<void> | null = null;

/** Inject adsbygoogle.js once. Also defines the H5 Games `adBreak`/`adConfig` shims the rewarded provider uses. */
export function loadAdSense(): Promise<void> {
  if (!ADSENSE_CLIENT) return Promise.reject(new Error('AdSense not configured'));
  if (loading) return loading;
  const w = window as unknown as { adsbygoogle: unknown[]; adBreak?: (o: unknown) => void; adConfig?: (o: unknown) => void };
  w.adsbygoogle = w.adsbygoogle || [];
  w.adBreak = w.adConfig = (o: unknown) => w.adsbygoogle.push(o);
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT!)}`;
    s.crossOrigin = 'anonymous';
    // H5 Games: rewarded breaks are only shown when the player asks for one.
    s.dataset.adFrequencyHint = '120s';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Ad script blocked'));
    document.head.appendChild(s);
  });
  w.adConfig?.({ preloadAdBreaks: 'on', sound: 'on' });
  return loading;
}
