import { useEffect, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { useProfile, randomName, cleanName } from '@/platform/profile';
import { handleAvailable, updateMe } from '@/platform/social';
import { checkHandle } from '@/platform/versus/handles';
import { VERSUS_ENABLED } from '@/platform/versus/config';
import { Sheet } from './Sheet';

/** Edit your display name and your unique @handle. */
export function NameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const name = useProfile((s) => s.name);
  const handle = useProfile((s) => s.handle);
  const setLocalName = useProfile((s) => s.setName);
  const [draft, setDraft] = useState(name);
  const [h, setH] = useState(handle ?? '');
  const [hint, setHint] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(name);
    setH(handle ?? '');
    setHint(null);
    setErr(null);
  }, [open, name, handle]);

  // Live handle check (local rules first, then the server, debounced).
  useEffect(() => {
    if (!open || !VERSUS_ENABLED) return;
    const v = h.trim().replace(/^@/, '');
    if (!v || v.toLowerCase() === (handle ?? '').toLowerCase()) return setHint(null);
    const bad = checkHandle(v);
    if (bad) return setHint({ ok: false, text: bad });
    setHint({ ok: true, text: 'Checking…' });
    const t = window.setTimeout(() => {
      handleAvailable(v)
        .then((r) => setHint(r.available ? { ok: true, text: `@${v} is free.` } : { ok: false, text: r.reason ?? 'Taken.' }))
        .catch(() => setHint(null));
    }, 350);
    return () => window.clearTimeout(t);
  }, [h, open, handle]);

  const nameOk = cleanName(draft).length >= 2;
  const handleOk = !hint || hint.ok;

  async function save() {
    setErr(null);
    if (!VERSUS_ENABLED) {
      setLocalName(draft);
      return onClose();
    }
    setBusy(true);
    try {
      const v = h.trim().replace(/^@/, '');
      await updateMe({ name: cleanName(draft), ...(v && v.toLowerCase() !== (handle ?? '').toLowerCase() ? { handle: v } : {}) });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Your profile">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div>
          <p className="label" style={{ marginBottom: 8 }}>
            Name
          </p>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <label className="field" style={{ flex: 1 }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20} aria-label="Display name" />
            </label>
            <button type="button" className="icon-btn" aria-label="Random name" onClick={() => setDraft(randomName())}>
              <Shuffle />
            </button>
          </div>
        </div>
        {VERSUS_ENABLED && (
          <div>
            <p className="label" style={{ marginBottom: 8 }}>
              Handle
            </p>
            <label className="field handle-field">
              <span className="at">@</span>
              <input
                value={h}
                onChange={(e) => setH(e.target.value.replace(/^@/, '').replace(/\s/g, '').slice(0, 20))}
                aria-label="Handle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <p className={`field-hint ${hint ? (hint.ok ? 'is-ok' : 'is-bad') : ''}`} aria-live="polite">
              {hint?.text ?? 'Unique to you. Friends find and add you with it.'}
            </p>
          </div>
        )}
        {err && <p className="field-hint is-bad">{err}</p>}
        <button className="btn btn-primary btn-lg" disabled={!nameOk || !handleOk || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Sheet>
  );
}
