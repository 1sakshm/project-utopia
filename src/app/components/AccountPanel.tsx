import { useEffect, useState } from 'react';
import { Check, Cloud, CloudOff, KeyRound, LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import { useProfile } from '@/platform/profile';
import { checkHandle } from '@/platform/versus/handles';
import { VERSUS_ENABLED } from '@/platform/versus/config';
import { handleAvailable } from '@/platform/social';
import { changePassword, createAccount, googleLogin, isSignedUp, linkGoogle, login, logout, snapshot, syncNow, unlinkGoogle, useAccount } from '@/platform/account';
import { hasProgress } from '@/platform/saveMerge';
import { Sheet } from './Sheet';
import { GoogleButton, googleEnabled } from './GoogleButton';

const PW_MIN = 8;
const ago = (t: number) => {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

/** Account box on the You tab: create / log in for guests; sync, Google and password for members. */
export function AccountPanel() {
  const account = useAccount((s) => s.account);
  const status = useAccount((s) => s.status);
  const lastSynced = useAccount((s) => s.lastSynced);
  const handle = useProfile((s) => s.handle);
  const [sheet, setSheet] = useState<null | 'create' | 'login' | 'password'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, []);

  if (!VERSUS_ENABLED) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sheets = (
    <>
      <CreateSheet open={sheet === 'create'} onClose={() => setSheet(null)} />
      <LoginSheet open={sheet === 'login'} onClose={() => setSheet(null)} />
      {account && <PasswordSheet open={sheet === 'password'} onClose={() => setSheet(null)} hasPassword={account.hasPassword} />}
    </>
  );

  if (!isSignedUp(account)) {
    return (
      <>
      {sheets}
      <section className="panel panel-pad account-cta">
        <div className="account-cta-head">
          <CloudOff size={20} aria-hidden />
          <span className="item-body">
            <span className="item-title">Your progress lives only on this device</span>
            <span className="item-sub" style={{ whiteSpace: 'normal' }}>
              Create an account to keep it safe and play on any device.
            </span>
          </span>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setSheet('create')}>
            <UserPlus size={16} /> Create account
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={() => setSheet('login')}>
            <LogIn size={16} /> Log in
          </button>
        </div>
      </section>
      </>
    );
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Account</h2>
      </div>
      <ul className="list">
        <li className="item">
          {status === 'error' ? <CloudOff size={18} className="dim" /> : <Cloud size={18} className="dim" />}
          <span className="item-body">
            <span className="item-title">
              Signed in as <span className="handle">@{handle}</span>
            </span>
            <span className="item-sub">
              {status === 'syncing' ? 'Saving…' : status === 'error' ? 'Couldn’t sync. Will retry.' : `Progress saved to your account · ${ago(lastSynced)}`}
            </span>
          </span>
          <button className="icon-btn" aria-label="Sync now" disabled={status === 'syncing'} onClick={() => void syncNow()}>
            <RefreshCw />
          </button>
        </li>
        <li className="item">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden style={{ flex: 'none' }}>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.2C12.5 13.7 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z" />
            <path fill="#FBBC05" d="M10.6 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.9-6z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6C6.6 42.6 14.6 48 24 48z" />
          </svg>
          <span className="item-body">
            <span className="item-title">Google</span>
            <span className="item-sub">{account!.google ? `Connected · ${account!.google}` : 'Connect to sign in without a password'}</span>
          </span>
          {account!.google ? (
            account!.hasPassword && (
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => void run(unlinkGoogle)}>
                Disconnect
              </button>
            )
          ) : googleEnabled ? null : (
            <span className="chip sm">Soon</span>
          )}
        </li>
        {!account!.google && googleEnabled && (
          <li className="item" style={{ justifyContent: 'center' }}>
            <GoogleButton text="continue_with" onCredential={(c) => void run(() => linkGoogle(c))} />
          </li>
        )}
        <li>
          <button className="item" onClick={() => setSheet('password')}>
            <KeyRound size={18} className="dim" />
            <span className="item-body">
              <span className="item-title">{account!.hasPassword ? 'Change password' : 'Set a password'}</span>
              <span className="item-sub">Log in on another device with @{handle} and your password</span>
            </span>
          </button>
        </li>
        <li>
          <button
            className="item"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Log out on this device? Your progress is saved to your account; this device will start fresh as a guest.')) void run(logout);
            }}
          >
            <LogOut size={18} className="dim" />
            <span className="item-body">
              <span className="item-title">Log out</span>
            </span>
          </button>
        </li>
      </ul>
      {err && <p className="field-hint is-bad">{err}</p>}
      {sheets}
    </section>
  );
}

// ---------- Create account ----------
function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const current = useProfile((s) => s.handle);
  const account = useAccount((s) => s.account);
  const [id, setId] = useState(current ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [hint, setHint] = useState<{ ok: boolean; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const created = isSignedUp(account);

  useEffect(() => {
    if (open) {
      setId(current ?? '');
      setPw('');
      setPw2('');
      setErr(null);
    }
  }, [open, current]);

  useEffect(() => {
    const v = id.trim().replace(/^@/, '');
    if (!open || !v || v.toLowerCase() === (current ?? '').toLowerCase()) return setHint(null);
    const bad = checkHandle(v);
    if (bad) return setHint({ ok: false, text: bad });
    const t = window.setTimeout(() => {
      handleAvailable(v)
        .then((r) => setHint(r.available ? { ok: true, text: `@${v} is free.` } : { ok: false, text: r.reason ?? 'Taken.' }))
        .catch(() => setHint(null));
    }, 350);
    return () => window.clearTimeout(t);
  }, [id, open, current]);

  const pwBad = pw.length > 0 && pw.length < PW_MIN ? `At least ${PW_MIN} characters.` : pw2 && pw2 !== pw ? 'Passwords don’t match.' : null;
  const canSubmit = id.trim().length >= 3 && (!hint || hint.ok) && pw.length >= PW_MIN && pw === pw2 && !busy;

  return (
    <Sheet open={open} onClose={onClose} title={created ? 'Account created' : 'Create account'}>
      {!created ? (
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await createAccount(id.trim().replace(/^@/, ''), pw);
            } catch (er) {
              setErr((er as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="muted">Everything you’ve played so far stays with you.</p>
          <label>
            <span className="label">ID</span>
            <span className="field handle-field">
              <span className="at">@</span>
              <input value={id} onChange={(e) => setId(e.target.value.replace(/\s/g, '').slice(0, 20))} autoCapitalize="none" autoComplete="username" spellCheck={false} aria-label="ID" />
            </span>
            <span className={`field-hint ${hint ? (hint.ok ? 'is-ok' : 'is-bad') : ''}`}>{hint?.text ?? 'Your @handle. You log in with it.'}</span>
          </label>
          <label>
            <span className="label">Password</span>
            <span className="field">
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" aria-label="Password" />
            </span>
          </label>
          <label>
            <span className="label">Confirm password</span>
            <span className="field">
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" aria-label="Confirm password" />
            </span>
            <span className={`field-hint ${pwBad ? 'is-bad' : ''}`}>{pwBad ?? `${PW_MIN}+ characters.`}</span>
          </label>
          {err && <p className="field-hint is-bad">{err}</p>}
          <button className="btn btn-primary btn-lg" disabled={!canSubmit}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      ) : (
        <div className="auth-form">
          <p className="auth-done">
            <Check size={18} /> You’re all set. Log in anywhere with <span className="handle">@{current}</span> and your password.
          </p>
          {googleEnabled && !account!.google && (
            <>
              <p className="label">Optional</p>
              <p className="muted">Connect Google so you can get back in even if you forget your ID or password.</p>
              <GoogleButton
                text="continue_with"
                onCredential={(c) =>
                  void linkGoogle(c)
                    .then(onClose)
                    .catch((er) => setErr((er as Error).message))
                }
              />
            </>
          )}
          {account?.google && (
            <p className="auth-done">
              <Check size={18} /> Google connected · {account.google}
            </p>
          )}
          {err && <p className="field-hint is-bad">{err}</p>}
          <button className="btn btn-lg" onClick={onClose}>
            Done
          </button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Log in ----------
function LoginSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guestProgress = open && hasProgress(snapshot());

  const finish = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Log in">
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void finish(() => login(id.trim().replace(/^@/, ''), pw));
        }}
      >
        <label>
          <span className="label">ID</span>
          <span className="field handle-field">
            <span className="at">@</span>
            <input value={id} onChange={(e) => setId(e.target.value.replace(/\s/g, ''))} autoCapitalize="none" autoComplete="username" spellCheck={false} aria-label="ID" />
          </span>
        </label>
        <label>
          <span className="label">Password</span>
          <span className="field">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" aria-label="Password" />
          </span>
        </label>
        {err && <p className="field-hint is-bad">{err}</p>}
        <button className="btn btn-primary btn-lg" disabled={!id || !pw || busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        {googleEnabled && (
          <>
            <p className="auth-or">
              <span>or</span>
            </p>
            <GoogleButton text="signin_with" onCredential={(c) => void finish(() => googleLogin(c))} />
            <p className="fine center">Forgot your ID or password? If you connected Google, sign in with Google, then set a new password.</p>
          </>
        )}
        {guestProgress && <p className="fine center">What you’ve played on this device will be added to your account.</p>}
      </form>
    </Sheet>
  );
}

// ---------- Password ----------
function PasswordSheet({ open, onClose, hasPassword }: { open: boolean; onClose: () => void; hasPassword: boolean }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCur('');
      setPw('');
      setPw2('');
      setErr(null);
      setDone(false);
    }
  }, [open]);
  const ok = pw.length >= PW_MIN && pw === pw2 && !busy;
  return (
    <Sheet open={open} onClose={onClose} title={hasPassword ? 'Change password' : 'Set a password'}>
      {done ? (
        <div className="auth-form">
          <p className="auth-done">
            <Check size={18} /> Password saved. Other devices that used the old one are signed out.
          </p>
          <button className="btn btn-lg" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await changePassword(cur, pw);
              setDone(true);
            } catch (er) {
              setErr((er as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {hasPassword && (
            <label>
              <span className="label">Current password</span>
              <span className="field">
                <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" aria-label="Current password" />
              </span>
              <span className="field-hint">Forgot it? If you just signed in with Google, leave this blank.</span>
            </label>
          )}
          <label>
            <span className="label">New password</span>
            <span className="field">
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" aria-label="New password" />
            </span>
          </label>
          <label>
            <span className="label">Confirm new password</span>
            <span className="field">
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" aria-label="Confirm new password" />
            </span>
            <span className={`field-hint ${pw2 && pw2 !== pw ? 'is-bad' : ''}`}>{pw2 && pw2 !== pw ? 'Passwords don’t match.' : `${PW_MIN}+ characters.`}</span>
          </label>
          {err && <p className="field-hint is-bad">{err}</p>}
          <button className="btn btn-primary btn-lg" disabled={!ok}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      )}
    </Sheet>
  );
}
