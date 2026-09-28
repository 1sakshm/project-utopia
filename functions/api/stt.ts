// Cloudflare Pages Function: POST /api/stt (audio/wav) → Sarvam saaras:v3 transcript. See api/_sarvam.ts.
import { handleSTT } from '../../api/_sarvam';

interface Env {
  SARVAM_API_KEY?: string;
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) => handleSTT(request, env.SARVAM_API_KEY);
