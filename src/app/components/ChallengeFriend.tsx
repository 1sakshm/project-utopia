// "Beat my score": the results-screen block for async challenges.
//  - After a normal run: a "Challenge a friend" button that opens a friend picker and sends this exact game
//    (same seed and start level) with the score to beat.
//  - After replaying a friend's challenge: submits the score (first try only) and shows won / lost.
import { useEffect, useState } from 'react';
import { Check, Send, Swords, Trophy } from 'lucide-react';
import { SKINS } from '@/platform/shop';
import { VERSUS_ENABLED } from '@/platform/versus/config';
import { asyncOutcome, type AsyncChallengeView } from '@/platform/versus/protocol';
import { replyAsyncChallenge, sendAsyncChallenge, useLastRun, useSocial } from '@/platform/social';
import { track } from '@/platform/analytics';
import { navigate } from '../router';
import { formatScore } from './Common';
import { Orb } from './Orb';
import { Sheet } from './Sheet';

/** A challenge being replayed (from the play route's query string). */
export interface AsyncPlay {
  id: string;
  seed: number;
  startLevel: number;
}

const skinOf = (id: string) => SKINS.find((k) => k.id === id) ?? SKINS[0];

export function ChallengeFriend({ gameId, title, score, eligible }: { gameId: string; title: string; score: number; eligible: boolean }) {
  const run = useLastRun((s) => s.run);
  const [open, setOpen] = useState(false);
  if (!VERSUS_ENABLED || !run || run.gameId !== gameId) return null;
  const canSend = eligible && score > 0 && !run.daily;
  return (
    <>
      {run.replyTo && <ReplyResult key={run.run} id={run.replyTo} score={score} token={run.run} />}
      {canSend && (
        <button className="btn btn-ghost challenge-cta" onClick={() => setOpen(true)}>
          <Swords size={16} /> {run.replyTo ? 'Challenge someone else' : 'Challenge a friend'}
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Beat my score">
        {open && <FriendPicker run={{ gameId, seed: run.seed, startLevel: run.startLevel, score }} title={title} />}
      </Sheet>
    </>
  );
}

function FriendPicker({ run, title }: { run: { gameId: string; seed: number; startLevel: number; score: number }; title: string }) {
  const friends = useSocial((s) => s.friends);
  const loaded = useSocial((s) => s.loaded);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => void useSocial.getState().refresh(), []);
  const sorted = [...friends].sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen);

  async function send(handle: string) {
    setBusy(handle);
    setErr(null);
    try {
      await sendAsyncChallenge(handle, run);
      setSent((s) => ({ ...s, [handle]: true }));
      track({ name: 'versus', action: 'async_send', game_id: run.gameId });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="challenge-pick">
      <p className="challenge-pitch">
        “Beat my <b className="num">{formatScore(run.score)}</b> on {title}”
      </p>
      <p className="fine">They get the exact same game. Open for 24 hours; their first try counts.</p>
      {err && <p className="field-hint is-bad">{err}</p>}
      {sorted.length ? (
        <ul className="list">
          {sorted.map((f) => (
            <li key={f.handle} className="item">
              <Orb size={34} skin={skinOf(f.skin)} spin={false} />
              <span className="item-body">
                <span className="item-title">{f.name}</span>
                <span className="item-sub handle">@{f.handle}</span>
              </span>
              {sent[f.handle] ? (
                <span className="chip sm">
                  <Check size={12} /> Sent
                </span>
              ) : (
                <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => void send(f.handle)} aria-label={`Challenge @${f.handle}`}>
                  <Send size={14} /> Send
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel empty">
          {loaded ? (
            <>
              <h3>No friends yet</h3>
              <p>Add someone by their @handle, then send them this run.</p>
              <button className="btn" onClick={() => navigate('/friends')}>
                Find friends
              </button>
            </>
          ) : (
            <p>Loading friends…</p>
          )}
        </div>
      )}
    </div>
  );
}

// One submission per run, even if the results screen mounts twice (React StrictMode, re-renders).
const replies = new Map<string, ReturnType<typeof replyAsyncChallenge>>();

/** Submits this run as the reply (once) and shows how it went against the challenger. */
function ReplyResult({ id, score, token }: { id: string; score: number; token: number }) {
  const [state, setState] = useState<{ c: AsyncChallengeView; first: boolean } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    const key = `${id}#${token}`;
    let p = replies.get(key);
    if (!p) replies.set(key, (p = replyAsyncChallenge(id, score)));
    p.then((r) => {
        if (!live) return;
        setState({ c: r.challenge, first: r.first });
        if (r.first) track({ name: 'versus', action: 'async_reply', game_id: r.challenge.gameId });
      })
      .catch((e) => live && setState({ error: (e as Error).message }));
    return () => {
      live = false;
    };
  }, [id, score, token]);

  if (!state) return <div className="challenge-result is-pending">Sending your score…</div>;
  if ('error' in state) return <div className="challenge-result">{state.error}</div>;
  const { c, first } = state;
  const mine = c.replyScore ?? score;
  const out = asyncOutcome(c.score, mine);
  return (
    <div className={`challenge-result is-${out}`} role="status">
      <Orb size={34} skin={skinOf(c.from.skin)} spin={false} />
      <span className="item-body">
        <span className="item-title">
          {out === 'won' ? (
            <>
              <Trophy size={14} aria-hidden /> You beat <span className="handle">@{c.from.handle}</span>
            </>
          ) : out === 'draw' ? (
            <>
              Dead heat with <span className="handle">@{c.from.handle}</span>
            </>
          ) : (
            <>
              <span className="handle">@{c.from.handle}</span>’s score stands
            </>
          )}
        </span>
        <span className="item-sub num">
          {formatScore(mine)} vs {formatScore(c.score)}
          {!first && ' · only your first try counts'}
        </span>
      </span>
    </div>
  );
}
