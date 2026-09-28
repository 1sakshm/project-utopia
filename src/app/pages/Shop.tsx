import { useRef, useState, type CSSProperties } from 'react';
import { useEconomy } from '@/platform/economy';
import { PACKS, SKINS, THEMES, type ShopItem } from '@/platform/shop';
import { showRewardedAd } from '@/platform/ads';
import { track } from '@/platform/analytics';
import { usePlayUi } from '@/platform/play';
import { Hero, SectionHead, d, useReveal } from '../components/Editorial';
import Wallet from '../components/Wallet';

/** Cosmetics + boost packs, paid with orbs earned by playing. No real money. */
export default function Shop() {
  const root = useRef<HTMLDivElement>(null);
  const eco = useEconomy();
  const say = usePlayUi((s) => s.say);
  const [busy, setBusy] = useState<string | null>(null);
  useReveal(root, []);

  function buy(item: ShopItem) {
    if (!useEconomy.getState().buy(item.id)) return;
    track({ name: 'shop_purchase', item: item.id, price: item.price });
    if (item.kind !== 'pack') useEconomy.getState().equip(item.id);
    say(`${item.name} ${item.kind === 'pack' ? 'added' : 'unlocked and equipped'}.`);
  }

  async function sample(item: ShopItem) {
    setBusy(item.id);
    const r = await showRewardedAd('shop');
    setBusy(null);
    if (r !== 'rewarded') return;
    useEconomy.getState().unlockSample(item.id);
    useEconomy.getState().equip(item.id);
    track({ name: 'shop_purchase', item: item.id, price: 0 });
    say(`${item.name} unlocked and equipped.`);
  }

  function action(item: ShopItem) {
    const owned = item.kind !== 'pack' && eco.owned.includes(item.id);
    const equipped = item.kind !== 'pack' && eco.equipped[item.kind] === item.id;
    if (equipped) return <span className="shop-tag">Equipped</span>;
    if (owned)
      return (
        <button className="btn" onClick={() => eco.equip(item.id)}>
          Equip
        </button>
      );
    const afford = eco.orbs >= item.price;
    return (
      <div className="shop-actions">
        <button className="btn btn-primary" disabled={!afford} onClick={() => buy(item)} aria-label={`Buy ${item.name} for ${item.price} orbs`}>
          <i className="coin sm" aria-hidden /> {item.price}
        </button>
        {item.adSample && !eco.sampled.includes(item.id) && eco.canWatchAd() && (
          <button className="btn btn-ghost shop-sample" disabled={busy !== null} onClick={() => void sample(item)}>
            ▶ Free with an ad
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="ed-page shop" ref={root}>
      <Hero compact kicker="Shop" title="Make it" accent="shine." lead="Spend the orbs you earn by playing. Everything here is cosmetic or optional; no real money, ever." palette={['#ffd36b', '#ff8fb1', '#b99cff']}>
        <div className="shop-wallet">
          <Wallet />
          <span className="muted">
            {eco.boosts.slowmo} Slow-mo · {eco.boosts.secondWind} Second Wind
          </span>
        </div>
      </Hero>

      <section className="ab-section">
        <SectionHead index={1} eyebrow="Your orb" title="Orb skins" sub="Your orb glows in the menu, on your profile and on reward screens." />
        <ul className="shop-grid">
          {SKINS.map((s, i) => (
            <li key={s.id} className="ed-card shop-item" data-reveal style={d(i % 3, 70)}>
              <span className="shop-orb" style={{ background: s.gradient, boxShadow: `0 0 34px ${s.glow}` }} aria-hidden />
              <b>{s.name}</b>
              <small>{s.blurb}</small>
              {action(s)}
            </li>
          ))}
        </ul>
      </section>

      <section className="ab-section">
        <SectionHead index={2} eyebrow="Your colors" title="Themes" sub="Changes the accent and aurora colors across the app. High contrast mode always takes priority." />
        <ul className="shop-grid">
          {THEMES.map((t, i) => (
            <li key={t.id} className="ed-card shop-item" data-reveal style={d(i % 3, 70)}>
              <span className="shop-swatch" style={{ '--s1': t.a1, '--s2': t.a2, '--s3': t.a3 } as CSSProperties} aria-hidden />
              <b>{t.name}</b>
              <small>{t.blurb}</small>
              {action(t)}
            </li>
          ))}
        </ul>
      </section>

      <section className="ab-section">
        <SectionHead index={3} eyebrow="Boosts" title="Boost packs" sub="Use them from the ready screen before a game. Boosted runs are scored separately, so your real bests stay honest." />
        <ul className="shop-grid">
          {PACKS.map((p, i) => (
            <li key={p.id} className="ed-card shop-item" data-reveal style={d(i % 3, 70)}>
              <span className="shop-pack display" aria-hidden>
                {p.boost === 'slowmo' ? '⏳' : '✦'}
              </span>
              <b>{p.name}</b>
              <small>{p.blurb}</small>
              {action(p)}
            </li>
          ))}
        </ul>
        <p className="fine shop-fine">Ads are always optional: up to 12 a day, and never needed to play any game.</p>
      </section>
    </div>
  );
}
