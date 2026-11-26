import { AlertIcon } from "./icons";
import { cx } from "./cx";

/**
 * The floating hint or error above a field (spec F4/F5 P-4 `FieldBubble`): white, a 1.5px danger
 * edge and the alert icon for an error, a sand edge and no icon for a hint, with a 6px tail. It is
 * absolutely positioned (bottom: 100% + --ip-bubble-gap) inside the field's relative wrapper, so it
 * never moves the layout. An error is announced once (role="alert" on a new message).
 */
export function FieldBubble({ id, text, tone = "error", className }: { id?: string; text: string; tone?: "error" | "hint"; className?: string }) {
  const error = tone === "error";
  return (
    <span
      id={id}
      role={error ? "alert" : undefined}
      className={cx(
        "mp-rise-in pointer-events-none absolute bottom-[calc(100%+var(--ip-bubble-gap))] left-0 z-30 flex max-w-[min(280px,calc(100vw-32px))] items-start gap-1.5 rounded-md border-[1.5px] bg-surface-raised px-2.5 py-1.5 text-help text-ink shadow-menu",
        "after:absolute after:top-full after:left-5 after:-mt-[4.5px] after:size-2.5 after:rotate-45 after:border-r-[1.5px] after:border-b-[1.5px] after:bg-surface-raised after:content-['']",
        error ? "border-danger after:border-danger" : "border-sand after:border-sand",
        className,
      )}
      data-testid={error ? "field-error" : "field-hint"}
    >
      {error && <AlertIcon size={16} className="mt-px shrink-0 text-danger" />}
      <span className="whitespace-normal">{text}</span>
    </span>
  );
}
