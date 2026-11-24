import type { ReactNode } from "react";
import { Button, buttonClasses } from "../ui/Button";

/**
 * F23 notices bring their own action (Notice renders `action.node` on the alert's row, before the
 * close button), so the shared Notice stays as it was. A link opens in a new tab; `autoFocus` moves
 * focus to it when it is a direct result of the user's click (a blocked window).
 */
type Spec = { label: string; onClick?: () => void; href?: string; autoFocus?: boolean };

export function cloudAction({ label, onClick, href, autoFocus }: Spec, icon?: ReactNode) {
  const className = "-my-1 shrink-0 self-center";
  return {
    label,
    onClick: onClick ?? (() => {}),
    icon,
    node: href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm", className)} onClick={onClick} autoFocus={autoFocus}>
        {label}
      </a>
    ) : (
      <Button size="sm" variant="outline" className={className} onClick={onClick} autoFocus={autoFocus}>
        {label}
      </Button>
    ),
  };
}

/** The busy ring that replaces a waiting notice's icon. */
export const busyIcon = <span className="ip-busy-ring" aria-hidden="true" />;
