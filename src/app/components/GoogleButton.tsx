import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, renderGoogleButton } from '@/platform/google';

/** Google's own "Continue with Google" button. Renders nothing when Google sign-in isn't configured. */
export function GoogleButton({ onCredential, text = 'continue_with' }: { onCredential: (credential: string) => void; text?: 'continue_with' | 'signin_with' | 'signup_with' }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !ref.current) return;
    renderGoogleButton(ref.current, (c) => cb.current(c), text).catch((e) => setErr((e as Error).message));
  }, [text]);
  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div className="google-btn-wrap">
      <div ref={ref} className="google-btn" />
      {err && <p className="field-hint is-bad">{err}</p>}
    </div>
  );
}

export const googleEnabled = !!GOOGLE_CLIENT_ID;
