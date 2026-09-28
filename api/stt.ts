// Vercel Edge function: POST /api/stt (audio/wav) → Sarvam saaras:v3 transcript. See api/_sarvam.ts.
import { handleSTT } from './_sarvam';

export const config = { runtime: 'edge' };

export default function handler(req: Request) {
  return handleSTT(req, process.env.SARVAM_API_KEY);
}
