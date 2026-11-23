import type { ReactNode } from "react";

export function VisuallyHidden({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span id={id} className="sr-only">
      {children}
    </span>
  );
}
