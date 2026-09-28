// Vercel Edge function: GET /api/tts → Sarvam bulbul:v3 speech (audio/wav). See api/_sarvam.ts.
import { handleTTS } from './_sarvam';

export const config = { runtime: 'edge' };

export default function handler(req: Request) {
  return handleTTS(req, process.env.SARVAM_API_KEY);
}
