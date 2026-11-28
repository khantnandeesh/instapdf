import { cx } from "./cx";
import { ChevronDownIcon } from "./icons";

/**
 * Native <select> (best on mobile, accessible for free) in the BerryPDF Input look: 1.5px edge,
 * 12px radius, berry edge and pink ring on focus (spec F3 M-4 `Select`).
 * `hideLabel` keeps the label for assistive tech only (when a visible heading already names it);
 * the description is screen-reader text (owner override: minimal text) unless `showDescription`.
 */
export function Select<T extends string>({
  id,
  label,
  value,
  options,
  description,
  onChange,
  hideLabel,
  showDescription,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  description?: string;
  onChange: (value: T) => void;
  hideLabel?: boolean;
  showDescription?: boolean;
  disabled?: boolean;
}) {
  const descId = `${id}-desc`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-semibold text-ink"}>
        {label}
      </label>
      <span className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          title={description}
          aria-describedby={description ? descId : undefined}
          onChange={(e) => onChange(e.target.value as T)}
          className="ip-field h-11 w-full cursor-pointer appearance-none ps-3.5 pe-10 text-[15px] disabled:cursor-default disabled:opacity-50"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon size={18} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-brand-strong" />
      </span>
      {description !== undefined && (
        <p id={descId} className={cx(showDescription ? "text-help text-muted" : "sr-only")}>
          {description}
        </p>
      )}
    </div>
  );
}
