import type { ReactNode } from "react";
import { cx } from "./cx";

/** Status mark. "beta": Mint Paper pill (uppercase, white on brand-strong). "soon": grey tag. */
export function Badge({ tone, children, id, className }: { tone: "beta" | "soon"; children: ReactNode; id?: string; className?: string }) {
  return (
    <span id={id} className={cx(tone === "beta" ? "mp-pill" : "mp-tag", "shrink-0", className)}>
      {children}
    </span>
  );
}
