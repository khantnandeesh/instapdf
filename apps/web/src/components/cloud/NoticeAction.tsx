import type { ReactNode } from "react";
import { Button, buttonClasses } from "../ui/Button";

/**
 * F23 notices bring their own action, which Notice puts on its row, after the text and before the
 * close (spec U-4 "inline action"; cloud.css .ip-notice-inline): a link (opens in a new tab) or a
 * button that can take focus when it is a direct result of the user's click (`autoFocus`, a blocked window).
 */
type Spec = { label: string; onClick?: () => void; href?: string; autoFocus?: boolean };

export function cloudAction({ label, onClick, href, autoFocus }: Spec, icon?: ReactNode) {
  const className = "ip-notice-act";
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
