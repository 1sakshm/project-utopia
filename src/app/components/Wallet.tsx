import { useEconomy } from '@/platform/economy';
import { navigate } from '../router';

/** Orb balance pill; opens the shop. */
export default function Wallet({ className = '', onOpen }: { className?: string; onOpen?: () => void }) {
  const orbs = useEconomy((s) => s.orbs);
  return (
    <a
      href="/shop"
      className={`wallet ${className}`}
      aria-label={`${orbs} orbs. Open the shop`}
      onClick={(e) => {
        e.preventDefault();
        onOpen?.();
        navigate('/shop');
      }}
    >
      <i className="coin" aria-hidden />
      {orbs}
    </a>
  );
}
