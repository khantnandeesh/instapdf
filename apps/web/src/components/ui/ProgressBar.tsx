import { cx } from "./cx";

/** Determinate when `value` (0-100) is set, indeterminate otherwise. Animates transform only. */
export function ProgressBar({ label, value, valueText, className }: { label: string; value?: number; valueText?: string; className?: string }) {
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
      className={cx("relative h-2 w-full overflow-hidden rounded-full bg-surface-sunken", className)}
    >
      {determinate ? (
        <div
          className="absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-(--ip-duration-fast) ease-linear"
          style={{ transform: `scaleX(${v / 100})` }}
        />
      ) : (
        <div className="ip-indeterminate absolute inset-y-0 left-0 w-[30%] rounded-full bg-primary" />
      )}
    </div>
  );
}
