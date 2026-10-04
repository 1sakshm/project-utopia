import { useEffect, useState } from 'react';
import { onStorageHealth, storageHealthy } from '@/platform/safeStorage';

/** Tells the player once if this browser won't let Utopia save progress (private mode, storage full). */
export default function StorageNotice() {
  const [ok, setOk] = useState(storageHealthy());
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => onStorageHealth(setOk), []);
  if (ok || dismissed) return null;
  return (
    <div className="toast" role="status">
      <p>
        <b>Progress can’t be saved here.</b> This browser is blocking storage (private mode or full). You can still play.
      </p>
      <div className="row">
        <button className="btn" onClick={() => setDismissed(true)}>
          OK
        </button>
      </div>
    </div>
  );
}
