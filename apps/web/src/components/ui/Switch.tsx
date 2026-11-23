import { cx } from "./cx";

/**
 * Mint Paper Switch: a 48x26 pill track with an 18px thumb, label on the left in #555 at 16px.
 * A native checkbox with role="switch" covers the whole row (the hit area).
 */
export function Switch({ id, label, checked, onChange, className }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void; className?: string }) {
  return (
    <label htmlFor={id} className={cx("relative inline-flex min-h-11 cursor-pointer items-center gap-3 text-[16px] leading-6 text-prose select-none", className)}>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0" />
      {label}
      <span
        aria-hidden="true"
        data-on={checked || undefined}
        className="mp-switch-track peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
      />
    </label>
  );
}
