import { BerryMark } from "../berry/Berry";
import { cx } from "../ui/cx";

/**
 * The BerryPDF logo: the berry mark and the name in Fredoka 600 (BerryPDF Header). Inside a
 * `.mp-brand` link the berry tips 14 degrees and grows to 1.1 on hover (0.3s ease-in-out).
 * The mark is decorative; the link's accessible name carries the product name.
 */
export function Wordmark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <span className={cx("mp-brand", className)}>
      <BerryMark size={size} />
      <span>BerryPDF</span>
    </span>
  );
}
