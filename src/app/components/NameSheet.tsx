import { useEffect, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { useProfile, randomName, cleanName } from '@/platform/profile';
import { Sheet } from './Sheet';

/** Change the display name opponents see. No account: the name lives on this device. */
export function NameSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const name = useProfile((s) => s.name);
  const setName = useProfile((s) => s.setName);
  const [draft, setDraft] = useState(name);
  useEffect(() => {
    if (open) setDraft(name);
  }, [open, name]);
  const ok = cleanName(draft).length >= 2;
  return (
    <Sheet open={open} onClose={onClose} title="Your name">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (setName(draft)) onClose();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <p className="muted">Shown to people you play against. No account needed.</p>
        <div className="row">
          <label className="field" style={{ flex: 1 }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20} aria-label="Display name" autoFocus />
          </label>
          <button type="button" className="icon-btn" aria-label="Random name" onClick={() => setDraft(randomName())}>
            <Shuffle />
          </button>
        </div>
        <button className="btn btn-primary btn-lg" disabled={!ok}>
          Save
        </button>
      </form>
    </Sheet>
  );
}
