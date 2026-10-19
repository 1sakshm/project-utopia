import { useState } from 'react';
import { Check, Hourglass, Wind } from 'lucide-react';
import { useEconomy } from '@/platform/economy';
import { PACKS, SKINS, THEMES, type ShopItem } from '@/platform/shop';
import { showRewardedAd } from '@/platform/ads';
import { ADS_ENABLED } from '@/platform/adsConfig';
import { track } from '@/platform/analytics';
import { usePlayUi } from '@/platform/play';
import { BackButton } from '../components/Editorial';
import Wallet from '../components/Wallet';
import { Orb } from '../components/Orb';

/** Cosmetics + boost packs, paid with orbs earned by playing. No real money. */
export default function Shop() {
  const eco = useEconomy();
  const say = usePlayUi((s) => s.say);
  const [busy, setBusy] = useState<string | null>(null);

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
    if (equipped)
      return (
        <span className="check" aria-label="Equipped">
          <Check size={14} strokeWidth={3} />
        </span>
      );
    if (owned)
      return (
        <button className="btn btn-sm" onClick={() => eco.equip(item.id)}>
          Use
        </button>
      );
    return (
      <>
        {ADS_ENABLED && item.adSample && !eco.sampled.includes(item.id) && eco.canWatchAd() && (
          <button className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void sample(item)}>
            Free with ad
          </button>
        )}
        <button className="btn btn-sm btn-primary" disabled={eco.orbs < item.price} onClick={() => buy(item)} aria-label={`Buy ${item.name} for ${item.price} orbs`}>
          <i className="coin sm" aria-hidden style={{ borderColor: 'currentColor' }} /> {item.price}
        </button>
      </>
    );
  }

  const row = (item: ShopItem, swatch: React.ReactNode) => (
    <li key={item.id} className="item">
      {swatch}
      <span className="item-body">
        <span className="item-title">{item.name}</span>
        <span className="item-sub">{item.blurb}</span>
      </span>
      <span className="item-end">{action(item)}</span>
    </li>
  );

  return (
    <div className="page">
      <div className="topbar">
        <BackButton />
        <h1>Shop</h1>
        <Wallet />
      </div>
      <p className="page-sub">Spend orbs you earn by playing. Nothing here costs real money.</p>

      <section className="section">
        <div className="section-head">
          <h2>Accent color</h2>
        </div>
        <ul className="list">{THEMES.map((t) => row(t, <span className="swatch" style={{ background: t.accent }} aria-hidden />))}</ul>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Orb skin</h2>
        </div>
        <ul className="list">{SKINS.map((s) => row(s, <Orb size={36} skin={s} />))}</ul>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Boosts</h2>
          <span className="fine">
            You have {eco.boosts.slowmo} slow-mo · {eco.boosts.secondWind} second wind
          </span>
        </div>
        <ul className="list">
          {PACKS.map((p) =>
            row(
              p,
              <span className="swatch icon" aria-hidden>
                {p.boost === 'slowmo' ? <Hourglass size={16} /> : <Wind size={16} />}
              </span>,
            ),
          )}
        </ul>
        <p className="fine" style={{ marginTop: 8 }}>
          Boosted runs are scored separately and never count in Versus.
        </p>
      </section>
    </div>
  );
}
