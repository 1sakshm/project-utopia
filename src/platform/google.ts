// "Continue with Google" via Google Identity Services. Configure with VITE_GOOGLE_CLIENT_ID (an OAuth *web* client
// id from Google Cloud Console, with this site's origins added). Without it, Google buttons simply don't render.

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || null;

interface Gsi {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean; itp_support?: boolean; use_fedcm_for_prompt?: boolean }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
      disableAutoSelect(): void;
    };
  };
}

let loading: Promise<Gsi> | null = null;
let handler: ((credential: string) => void) | null = null;

function load(): Promise<Gsi> {
  if (!GOOGLE_CLIENT_ID) return Promise.reject(new Error('Google sign-in isn’t set up.'));
  if (loading) return loading;
  loading = new Promise<Gsi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      const g = (window as unknown as { google?: Gsi }).google;
      if (!g) return reject(new Error('Google sign-in failed to load.'));
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID!,
        callback: (r) => handler?.(r.credential),
        ux_mode: 'popup',
        itp_support: true,
      });
      resolve(g);
    };
    s.onerror = () => {
      loading = null;
      reject(new Error('Google sign-in is blocked on this network or browser.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Render Google's button into `el`; `onCredential` gets the ID token to send to our server. */
export async function renderGoogleButton(el: HTMLElement, onCredential: (credential: string) => void, text: 'continue_with' | 'signin_with' | 'signup_with' = 'continue_with') {
  const g = await load();
  handler = onCredential;
  el.replaceChildren();
  g.accounts.id.renderButton(el, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text, logo_alignment: 'left', width: Math.min(360, el.clientWidth || 320) });
}

export function googleSignOut() {
  void load()
    .then((g) => g.accounts.id.disableAutoSelect())
    .catch(() => {});
}
