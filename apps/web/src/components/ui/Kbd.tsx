import type { ReactNode } from "react";

/** Keyboard key hint. Decorative: describe the shortcut in text elsewhere. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      aria-hidden="true"
      className="inline-grid h-5 min-w-5 place-items-center rounded-sm border border-b-2 border-border-strong px-1 font-mono text-xs text-fg-muted"
    >
      {children}
    </kbd>
  );
}
