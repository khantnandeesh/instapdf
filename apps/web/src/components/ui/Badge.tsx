import type { ReactNode } from "react";
import { cx } from "./cx";
import { ClockIcon } from "./icons";

/** Small status label. "soon" carries a clock icon so it does not rely on color. */
export function Badge({ tone, children, id, className }: { tone: "beta" | "soon"; children: ReactNode; id?: string; className?: string }) {
  return (
    <span
      id={id}
      className={cx(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        // Neutral badge words are text-strong: `text` on an ink-2 fill would dip under 4.5:1.
        tone === "beta" ? "bg-primary-soft text-primary-ink" : "bg-surface-sunken text-fg",
        className,
      )}
    >
      {tone === "soon" && <ClockIcon size={12} />}
      {children}
    </span>
  );
}
