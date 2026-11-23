import { cx } from "./cx";
import { CheckIcon } from "./icons";

/** On/off switch: a native checkbox with role="switch" over a drawn track. The whole row is the hit area. */
export function Switch({ id, label, checked, onChange, className }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void; className?: string }) {
  return (
    <label htmlFor={id} className={cx("relative inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium select-none", className)}>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none opacity-0" />
      <span
        aria-hidden="true"
        className={cx(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-(--ip-duration-fast)",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
          checked ? "border-primary bg-primary" : "border-border-strong bg-surface-raised",
        )}
      >
        <span
          className={cx(
            "absolute top-px left-px grid size-4 place-items-center rounded-full transition-transform duration-(--ip-duration-fast)",
            checked ? "translate-x-4 bg-on-primary text-primary" : "bg-border-strong",
          )}
        >
          {checked && <CheckIcon size={12} strokeWidth={3} />}
        </span>
      </span>
      {label}
    </label>
  );
}
