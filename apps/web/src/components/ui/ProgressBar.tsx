import { cx } from "./cx";

/**
 * BerryPDF progress.
 * - Determinate (`value` 0-100 set): JamProgress, an 18px cream track filling with strawberry jam
 *   whose seeds drift sideways. The fill slides in from the left with a transform (never its width),
 *   200ms per update (docs/design/motion.md T11). Show the number in text beside it.
 * - Indeterminate: the same jam track with a short jam segment gliding across it.
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
      className={cx("mp-jam", !determinate && "mp-jam--indeterminate", fixed && "mp-progress--fixed", className)}
    >
      {/* The fill's amount (--p, 0-100) is set after hydration through the CSSOM (never in server HTML). */}
      {determinate ? <i style={{ "--p": v } as React.CSSProperties} /> : <i />}
    </div>
  );
}

