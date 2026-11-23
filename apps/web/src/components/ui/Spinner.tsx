import { BerryLoader } from "../berry/Berry";
import { cx } from "./cx";

/**
 * Small busy indicator: the BerryPDF berry loader drawn at 16-24px (BerryLoader "inside buttons
 * and rows"). With `label` it is `role="status"` with that text for screen readers. Under reduced
 * motion the berry stands still and pulses (F1 U-4: it carries state).
 */
export function Spinner({ size = 20, label, className }: { size?: 16 | 20 | 24; label?: string; className?: string }) {
  const berry = <BerryLoader size={size} className={cx("ip-busy shrink-0", className)} />;
  if (!label) return berry;
  return (
    <span role="status" className="inline-flex">
      {berry}
      <span className="sr-only">{label}</span>
    </span>
  );
}
