import "./field-bubble.css";
import { cx } from "./cx";
import { AlertIcon } from "./icons";

/**
 * The hint or error of a field (spec F4/F5 UI P-4 `FieldBubble`). In the bottom bar it floats
 * above the field (absolute, so it never moves the layout): white with a 6px tail, a 1.5px danger
 * edge and the alert icon for an error, the card edge for a hint. In the side panel the same text
 * is a line under the field, in a reserved 20px slot.
 *
 * An error has role="alert" and is keyed by its text, so each new error is announced once, not
 * on every keystroke. A hint is decorative (the field's sr-only description says the same).
 *
 * Fields load it lazily (`LazyFieldBubble`): it only ever shows once a file is in, so it stays out
 * of the tool's first load (spec F4/F5 UI P-12); `BubbleSlot` keeps the side panel's line meanwhile.
 */
export function FieldBubble({ id, error, hint, className }: { id: string; error?: string | null; hint?: string | null; className?: string }) {
  const text = error || hint || "";
  const isError = !!error;
  return (
    // Layout and the bubble look live in field-bubble.css (loaded with this chunk, not on every page).
    <span className={cx("ip-fb", className)} data-empty={text ? undefined : ""}>
      {text && (
        <span
          key={text}
          id={isError ? id : undefined}
          role={isError ? "alert" : undefined}
          aria-hidden={isError ? undefined : true}
          data-testid={isError ? "field-error" : "field-hint"}
          data-tone={isError ? "error" : "hint"}
          className="ip-fb__text ip-bubble-in flex items-center gap-1.5 text-help font-semibold"
        >
          {isError && <AlertIcon size={16} className="shrink-0 text-danger" />}
          <span className="min-w-0">{text}</span>
        </span>
      )}
    </span>
  );
}
