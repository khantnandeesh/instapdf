import { cx } from "./cx";
import { DeviceIcon } from "./icons";

export const RUNTIME_CLIENT_TEXT = "Runs in your browser";

/** "Runs in your browser": a fact about the tool, shown as icon + text (not a pill). */
export function RuntimeMarker({ id, className }: { id?: string; className?: string }) {
  return (
    <span id={id} className={cx("inline-flex min-w-0 items-center gap-1 text-xs text-fg-muted", className)}>
      <DeviceIcon size={14} className="shrink-0" />
      {RUNTIME_CLIENT_TEXT}
    </span>
  );
}
