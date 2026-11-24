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
}: {
  id: string;
  label: string;
  shortLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label htmlFor={id} className={cx("relative inline-flex min-h-11 cursor-pointer items-center gap-3 text-[16px] leading-6 text-ink select-none", className)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0"
        aria-label={shortLabel ? label : undefined}
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
