// Cloudflare Pages Function: GET /api/tts → Sarvam bulbul:v3 speech (audio/wav). See api/_sarvam.ts.
import { handleTTS } from '../../api/_sarvam';

interface Env {
  SARVAM_API_KEY?: string;
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) => handleTTS(request, env.SARVAM_API_KEY);
