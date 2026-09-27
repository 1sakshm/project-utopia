import type { QualityProfile } from '@/sdk/types';
import { useSettings } from '@/platform/settings';

let detected: QualityProfile['tier'] | null = null;

function detectTier(): QualityProfile['tier'] {
  if (detected) return detected;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  let tier: QualityProfile['tier'] = 'high';
  if (mobile) tier = cores >= 6 && mem >= 4 ? 'medium' : 'low';
  else if (cores <= 4 || mem <= 4) tier = 'medium';
  // Very small GPUs: probe WebGL renderer string.
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const r = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/SwiftShader|llvmpipe|Mali-4|Adreno \(TM\) 3/i.test(r)) tier = 'low';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* ignore */
  }
  detected = tier;
  return tier;
}

let runtimeDowngrade = 0;
export function downgradeQuality() {
  runtimeDowngrade = Math.min(2, runtimeDowngrade + 1);
}

const ORDER: QualityProfile['tier'][] = ['low', 'medium', 'high'];

export function getQuality(mode: 'play' | 'preview'): QualityProfile {
  const g = useSettings.getState().graphics;
  let tier = g === 'battery' ? 'low' : g === 'high' ? 'high' : detectTier();
  const idx = Math.max(0, ORDER.indexOf(tier) - runtimeDowngrade);
  tier = ORDER[idx];
  const dpr = window.devicePixelRatio || 1;
  const base: Record<QualityProfile['tier'], QualityProfile> = {
    low: { tier: 'low', maxDpr: Math.min(dpr, 1.25), postFx: false, particleScale: 0.35 },
    medium: { tier: 'medium', maxDpr: Math.min(dpr, 1.5), postFx: true, particleScale: 0.65 },
    high: { tier: 'high', maxDpr: Math.min(dpr, 2), postFx: true, particleScale: 1 },
  };
  const q = { ...base[tier] };
  if (mode === 'preview') {
    q.maxDpr = Math.min(q.maxDpr, 1.25);
    q.particleScale *= 0.7;
    if (tier !== 'high') q.postFx = false;
  }
  return q;
}

export function canRunLivePreview(): boolean {
  const s = useSettings.getState();
  if (s.previewStyle === 'still') return false;
  if (s.previewStyle === 'live') return true;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return false;
  return true;
}
