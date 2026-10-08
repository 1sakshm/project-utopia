// Share "Today's 3" as an image card (with the text alongside). Images travel much better on WhatsApp and
// Instagram than plain text. Falls back to text sharing, then to the clipboard.
import { GAME_BY_ID } from '@/games/registry';
import { ABILITY_RING, RINGS } from '@/platform/abilities';
import { RING_EMOJI, shareText, type TrioStatus } from '@/platform/retention';

const W = 1080;
const H = 1350;

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderTodayCard(st: TrioStatus): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  await document.fonts?.ready;

  // Background: deep night with a soft aurora.
  ctx.fillStyle = '#0b0d16';
  ctx.fillRect(0, 0, W, H);
  for (const [x, y, r, col] of [
    [180, 160, 620, 'rgba(139,108,255,0.45)'],
    [960, 520, 560, 'rgba(255,143,177,0.28)'],
    [420, 1260, 640, 'rgba(111,227,255,0.22)'],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Brand orb + header
  const orb = ctx.createRadialGradient(118, 120, 4, 130, 132, 34);
  orb.addColorStop(0, '#fff4d0');
  orb.addColorStop(0.45, '#ff9fb8');
  orb.addColorStop(0.85, '#6c5cff');
  orb.addColorStop(1, '#1b1640');
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(130, 132, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f2ff';
  ctx.font = '600 44px "Bricolage Grotesque Variable", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Project Utopia', 186, 134);

  const date = new Date(st.day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  ctx.font = '800 30px "Geist Variable", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(244,242,255,0.65)';
  ctx.fillText(`TODAY’S 3 · ${date.toUpperCase()}`, 96, 262);
  ctx.font = '500 92px "Bricolage Grotesque Variable", system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(st.complete ? 'All three, done.' : `${st.count} of 3 done.`, 92, 360);

  // Three game rows
  const posters = await Promise.all(st.ids.map((id) => loadImg(`/posters/${id}.jpg`)));
  st.ids.forEach((id, i) => {
    const m = GAME_BY_ID[id].manifest;
    const ring = RINGS.find((r) => r.id === ABILITY_RING[m.abilities.primary])!;
    const y = 470 + i * 230;
    ctx.save();
    roundRect(ctx, 80, y, W - 160, 200, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.strokeStyle = st.done[i] ? 'rgba(141,255,196,0.55)' : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
    const p = posters[i];
    if (p) {
      ctx.save();
      roundRect(ctx, 104, y + 22, 117, 156, 22);
      ctx.clip();
      const s = Math.max(117 / p.width, 156 / p.height);
      ctx.drawImage(p, 104 + (117 - p.width * s) / 2, y + 22 + (156 - p.height * s) / 2, p.width * s, p.height * s);
      ctx.restore();
    }
    ctx.fillStyle = ring.color;
    ctx.font = '800 26px "Geist Variable", system-ui, sans-serif';
    ctx.fillText(`${RING_EMOJI[ring.id]}  ${ring.label.toUpperCase()}`, 256, y + 70);
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 56px "Bricolage Grotesque Variable", system-ui, sans-serif';
    ctx.fillText(m.title, 256, y + 132);
    ctx.textAlign = 'right';
    ctx.font = '800 48px "Geist Variable", system-ui, sans-serif';
    ctx.fillStyle = st.done[i] ? '#8dffc4' : 'rgba(244,242,255,0.4)';
    ctx.fillText(st.done[i] ? st.scores[i].toLocaleString('en-US') : '—', W - 116, y + 104);
    ctx.textAlign = 'left';
  });

  // Footer CTA
  ctx.fillStyle = 'rgba(244,242,255,0.75)';
  ctx.font = '700 34px "Geist Variable", system-ui, sans-serif';
  ctx.fillText('Same three games for everyone today.', 96, 1196);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 38px "Geist Variable", system-ui, sans-serif';
  ctx.fillText('Play free → playutopia.pages.dev', 96, 1256);

  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

/** Share the day as an image + text. Returns what happened so the UI can say "Copied". */
export async function shareToday(st: TrioStatus): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const text = shareText(st);
  try {
    const blob = await renderTodayCard(st);
    if (blob && navigator.share && navigator.canShare) {
      const file = new File([blob], `utopia-${st.day}.png`, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return 'shared';
      }
    }
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {
    return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
