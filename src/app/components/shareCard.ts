// Share "Today's 3" as an image card (with the text alongside). Images travel much better on WhatsApp and
// Instagram than plain text. Falls back to text sharing, then to the clipboard.
import { GAME_BY_ID } from '@/games/registry';
import { ABILITY_RING, RINGS } from '@/platform/abilities';
import { shareText, type TrioStatus } from '@/platform/retention';

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

  const FONT = '"Manrope Variable", system-ui, sans-serif';
  const DISPLAY = '"Fraunces Variable", Georgia, serif';
  const LIME = '#d9b46d';
  ctx.textBaseline = 'middle';

  // Flat graphite, like the app.
  const bg = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 1.1);
  bg.addColorStop(0, '#2a2622');
  bg.addColorStop(0.5, '#1f1d1a');
  bg.addColorStop(1, '#151311');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    ctx.globalAlpha = Math.random() * 0.05;
    ctx.fillStyle = '#f5e9cf';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Brand mark + header
  roundRect(ctx, 96, 100, 64, 64, 16);
  ctx.fillStyle = LIME;
  ctx.fill();
  ctx.fillStyle = '#0b0b0c';
  ctx.font = `750 40px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('u', 128, 130);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e9dfcb';
  ctx.font = `400 44px ${DISPLAY}`;
  ctx.fillText('Utopia', 184, 133);

  const date = new Date(st.day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  ctx.font = `500 32px ${FONT}`;
  ctx.fillStyle = '#8a8a90';
  ctx.fillText(`Today’s 3 · ${date}`, 96, 270);
  ctx.font = `400 96px ${DISPLAY}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(st.complete ? 'All three done.' : `${st.count} of 3 done.`, 90, 360);

  // Three game rows in one hairline panel
  const posters = await Promise.all(st.ids.map((id) => loadImg(`/posters/${id}.jpg`)));
  const top = 470;
  const rowH = 220;
  roundRect(ctx, 80, top, W - 160, rowH * 3, 32);
  ctx.fillStyle = '#24211d';
  ctx.fill();
  ctx.strokeStyle = 'rgba(233, 223, 203, 0.1)';
  ctx.lineWidth = 2;
  ctx.stroke();
  st.ids.forEach((id, i) => {
    const m = GAME_BY_ID[id].manifest;
    const ring = RINGS.find((r) => r.id === ABILITY_RING[m.abilities.primary])!;
    const y = top + i * rowH;
    if (i > 0) {
      ctx.fillStyle = 'rgba(233, 223, 203, 0.07)';
      ctx.fillRect(80, y, W - 160, 2);
    }
    const p = posters[i];
    if (p) {
      ctx.save();
      roundRect(ctx, 112, y + 32, 117, 156, 18);
      ctx.clip();
      const sc = Math.max(117 / p.width, 156 / p.height);
      ctx.drawImage(p, 112 + (117 - p.width * sc) / 2, y + 32 + (156 - p.height * sc) / 2, p.width * sc, p.height * sc);
      ctx.restore();
    }
    ctx.fillStyle = ring.color;
    ctx.fillRect(264, y + 78, 14, 14);
    ctx.fillStyle = '#8a8a90';
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(ring.label, 292, y + 86);
    ctx.fillStyle = '#ffffff';
    ctx.font = `400 54px ${DISPLAY}`;
    ctx.fillText(m.title, 262, y + 140);
    ctx.textAlign = 'right';
    ctx.font = `400 52px ${DISPLAY}`;
    ctx.fillStyle = st.done[i] ? LIME : '#55555b';
    ctx.fillText(st.done[i] ? st.scores[i].toLocaleString('en-US') : '—', W - 120, y + 112);
    ctx.textAlign = 'left';
  });

  // Footer CTA
  ctx.fillStyle = '#a3a3a8';
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText('Same three games for everyone today.', 96, 1196);
  ctx.fillStyle = '#ffffff';
  ctx.font = `650 38px ${FONT}`;
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
