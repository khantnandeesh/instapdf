import { cx } from "./cx";

/**
 * Mint Paper Progress: a 3px mint line. `fixed` pins it to the top of the viewport (z-progress)
 * while work runs. Determinate when `value` (0-100) is set (width animates over 0.5s),
 * indeterminate otherwise (two bars sweeping on a 2.1s loop).
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
      className={cx("mp-progress", fixed && "mp-progress--fixed", !determinate && "mp-progress--indeterminate", className)}
    >
      {determinate && <div className="mp-progress__bar" style={{ width: `${v}%` }} />}
    </div>
  );
}
