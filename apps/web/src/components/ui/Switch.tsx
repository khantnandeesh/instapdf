import { cx } from "./cx";

/**
 * BerryPDF Switch: a 50x28 pill track, a 22px white thumb that slides with a tiny bounce (0.3s);
 * berry when on. Label on its left.
 * A native checkbox with role="switch" covers the whole row (the hit area).
 */
/** `shortLabel`, when given, is what phones show (below 640 px); the accessible name stays `label`. */
export function Switch({
  id,
  label,
  shortLabel,
  checked,
  onChange,
  className,
  describedBy,
  ariaLabel,
  spread,
}: {
  id: string;
  label: string;
  /** Accessible name when it says more than the visible label (which it must contain). */
  ariaLabel?: string;
  shortLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  describedBy?: string;
  /** Fills its row: label at the start, switch at the end (a list of settings in a panel or sheet). */
  spread?: boolean;
}) {
  return (
    <label htmlFor={id} className={cx("relative min-h-11 cursor-pointer items-center gap-3 text-[16px] leading-6 text-ink select-none", spread ? "flex w-full justify-between" : "inline-flex", className)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-describedby={describedBy}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0"
        aria-label={ariaLabel ?? (shortLabel ? label : undefined)}
      />
      {shortLabel ? (
        <>
          <span aria-hidden="true" className="sm:hidden">
            {shortLabel}
          </span>
          <span aria-hidden="true" className="max-sm:hidden">
            {label}
          </span>
        </>
      ) : (
        label
      )}
      <span aria-hidden="true" data-on={checked || undefined} className="mp-switch-track peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus" />
    </label>
  );
}
