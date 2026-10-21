// Session history as CSV: one row per finished session, readable in any spreadsheet or stats package.
// This is the participant-side export the trial protocol relies on (docs/paper, §4.7): nothing leaves the device
// unless the player shares the file themselves.
import { GAME_BY_ID } from '@/games/registry';
import { ABILITY_RING } from './abilities';
import type { SessionRecord } from './progress';

export const CSV_COLUMNS = ['started_utc', 'game_id', 'game', 'family', 'primary_ability', 'mode', 'timing', 'assisted', 'duration_s', 'score', 'level', 'stats_json'] as const;

const cell = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function historyCsv(history: SessionRecord[]): string {
  const rows = [...history]
    .sort((a, b) => a.t - b.t)
    .map((h) => {
      const m = GAME_BY_ID[h.gameId]?.manifest;
      return [
        new Date(h.t).toISOString(),
        h.gameId,
        m?.title ?? '',
        m ? ABILITY_RING[m.abilities.primary] : '',
        m?.abilities.primary ?? '',
        h.mode,
        h.timing,
        !!h.assisted,
        Math.round(h.ms / 100) / 10,
        h.score,
        h.level,
        JSON.stringify(h.stats ?? {}),
      ]
        .map(cell)
        .join(',');
    });
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}

/** Share the file where the platform supports it (phones), otherwise download it. Returns what happened. */
export async function shareOrDownload(text: string, name: string, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([text], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}
