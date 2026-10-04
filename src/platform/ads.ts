// Rewarded ads, always opt-in. One interface, two providers:
//  - 'mock' (default): an in-app, clearly labelled placeholder ad (5s) for development and until a real network
//    is approved. No network calls, no tracking.
//  - 'h5': Google H5 Games Ads (AdSense for games) via window.adBreak({ type: 'reward' }). Activate with
//    VITE_ADS_PROVIDER=h5 once the site is approved and the adsbygoogle script (with data-ad-client=<your
//    publisher id>) is added to index.html. Returns 'unavailable' if the API isn't present.
import { create } from 'zustand';
import { useEconomy } from './economy';
import { track } from './analytics';
import { ADS_MODE } from './adsConfig';

export type AdPlacement = 'double-orbs' | 'second-chance' | 'boost' | 'shop';
export type AdResult = 'rewarded' | 'dismissed' | 'unavailable';

export interface AdProvider {
  showRewarded(placement: AdPlacement): Promise<AdResult>;
}

// ---------- mock provider (drives <AdHost/>) ----------
interface MockAdState {
  open: AdPlacement | null;
  resolve: ((r: AdResult) => void) | null;
  finish: (r: AdResult) => void;
}
export const useMockAd = create<MockAdState>((set, get) => ({
  open: null,
  resolve: null,
  finish: (r) => {
    get().resolve?.(r);
    set({ open: null, resolve: null });
  },
}));

const mockProvider: AdProvider = {
  showRewarded: (placement) =>
    new Promise<AdResult>((resolve) => {
      if (useMockAd.getState().open) return resolve('unavailable');
      useMockAd.setState({ open: placement, resolve });
    }),
};

// ---------- Google H5 Games Ads provider ----------
type AdBreak = (o: {
  type: 'reward';
  name: string;
  beforeReward: (showAdFn: () => void) => void;
  adDismissed: () => void;
  adViewed: () => void;
  adBreakDone: (info: { breakStatus: string }) => void;
}) => void;

const h5Provider: AdProvider = {
  showRewarded: (placement) =>
    new Promise<AdResult>((resolve) => {
      const adBreak = (window as unknown as { adBreak?: AdBreak }).adBreak;
      if (!adBreak) return resolve('unavailable');
      let result: AdResult = 'unavailable';
      adBreak({
        type: 'reward',
        name: placement,
        beforeReward: (showAdFn) => showAdFn(),
        adDismissed: () => (result = 'dismissed'),
        adViewed: () => (result = 'rewarded'),
        adBreakDone: () => resolve(result),
      });
    }),
};

const provider: AdProvider = ADS_MODE === 'h5' ? h5Provider : mockProvider;

/** Show a rewarded ad if the player asks for one. Respects the daily cap. */
export async function showRewardedAd(placement: AdPlacement): Promise<AdResult> {
  const eco = useEconomy.getState();
  track({ name: 'ad_request', placement });
  if (!eco.canWatchAd()) {
    track({ name: 'ad_result', placement, result: 'unavailable' });
    return 'unavailable';
  }
  const result = await provider.showRewarded(placement);
  if (result === 'rewarded') useEconomy.getState().noteAd();
  track({ name: 'ad_result', placement, result });
  return result;
}
