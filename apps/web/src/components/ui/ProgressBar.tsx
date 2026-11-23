import { cx } from "./cx";

/**
 * BerryPDF progress.
 * - Determinate (`value` 0-100 set): JamProgress, an 18px cream track filling with strawberry jam
 *   whose seeds drift sideways; the width eases over 0.5s. Show the number in text beside it.
 * - Indeterminate: the vine Progress strip, a strawberry runner sliding left to right (4.4s loop),
 *   fading at both ends.
 * Both are `role="progressbar"` with the same ARIA as before (F1 U-4).
 */
export function ProgressBar({ label, value, valueText, fixed, className }: { label: string; value?: number; valueText?: string; fixed?: boolean; className?: string }) {
  const determinate = typeof value === "number";
  const v = determinate ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(v) : undefined}
      aria-valuetext={valueText}
      className={cx(determinate ? "mp-jam" : "mp-progress", fixed && "mp-progress--fixed", className)}
    >
      {/* The fill's width is set after hydration through the CSSOM (never in server HTML). */}
      {determinate && <i style={{ width: `${v}%` }} />}
    </div>
  );
}

/**
 * The moving vine on its own: a decorative "working" strip (aria-hidden) for a view whose
 * progress is already announced elsewhere. `fixed` pins it under the sticky header.
 */
export function VineStrip({ fixed, className }: { fixed?: boolean; className?: string }) {
  return <div aria-hidden="true" data-testid="vine-strip" className={cx("mp-progress", fixed && "mp-progress--fixed", className)} />;
}
