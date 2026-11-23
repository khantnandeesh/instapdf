import { cx } from "./cx";

/**
 * BerryPDF Switch: a 50x28 pill track, a 22px white thumb that slides with a tiny bounce (0.3s);
 * berry when on. Label on its left.
 * A native checkbox with role="switch" covers the whole row (the hit area).
 */
export function Switch({ id, label, checked, onChange, className, describedBy }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void; className?: string; describedBy?: string }) {
  return (
    <label htmlFor={id} className={cx("relative inline-flex min-h-11 cursor-pointer items-center gap-3 text-[16px] leading-6 text-ink select-none", className)}>
      <input id={id} type="checkbox" role="switch" aria-describedby={describedBy} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0" />
      {label}
      <span
        aria-hidden="true"
        data-on={checked || undefined}
        className="mp-switch-track peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
      />
    </label>
  );
}
