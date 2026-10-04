// Which rewarded-ad provider is active. Kept separate from ads.ts so the economy store can read it without a cycle.
//  - 'h5'   : Google H5 Games Ads (set VITE_ADS_PROVIDER=h5 once the site is approved)
//  - 'mock' : the clearly labelled placeholder player (default in development and tests)
//  - 'off'  : no ads at all; every "watch an ad" option is hidden (default in production builds)
export type AdsMode = 'h5' | 'mock' | 'off';
const env = import.meta.env.VITE_ADS_PROVIDER as string | undefined;
export const ADS_MODE: AdsMode = env === 'h5' || env === 'mock' || env === 'off' ? env : import.meta.env.DEV ? 'mock' : 'off';
export const ADS_ENABLED = ADS_MODE !== 'off';
