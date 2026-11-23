import { ChevronDownIcon } from "./icons";

/**
 * Native <select> (best on mobile, accessible for free) with a visible label
 * above and a description line below that reserves two lines, so changing
 * the choice moves nothing (spec F3 M-4 `Select`).
 */
export function Select<T extends string>({
  id,
  label,
  value,
  options,
  description,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  description?: string;
  onChange: (value: T) => void;
}) {
  const descId = `${id}-desc`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <span className="relative">
        <select
          id={id}
          value={value}
          aria-describedby={description ? descId : undefined}
          onChange={(e) => onChange(e.target.value as T)}
          className="h-11 w-full appearance-none rounded-md border border-border-strong bg-surface-raised ps-3 pe-10 text-sm text-fg disabled:text-fg-disabled"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon size={18} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-fg-muted" />
      </span>
      {description !== undefined && (
        <p id={descId} className="min-h-8 text-xs text-fg-muted">
          {description}
        </p>
      )}
    </div>
  );
}
