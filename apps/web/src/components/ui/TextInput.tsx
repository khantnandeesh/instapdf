import { cx } from "./cx";

/**
 * BerryPDF text input: one line of free text in the shared field look (`ip-field`, 44px). The label is
 * always there for screen readers; `hideLabel` keeps it out of sight where a step heading already says it.
 */
export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hideLabel,
  disabled,
  maxLength = 200,
  onEnter,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hideLabel?: boolean;
  disabled?: boolean;
  maxLength?: number;
  onEnter?: () => void;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "text-sm font-semibold text-ink"}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) onEnter();
        }}
        className="ip-field h-11 w-full min-w-0 px-3.5 text-[15px]"
      />
    </div>
  );
}
