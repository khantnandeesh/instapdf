import type { ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./icons";

export type NoticeTone = "info" | "success" | "warning" | "danger";

/**
 * Mint Paper Alert and Callout.
 * - "alert" (floating notices, and every danger notice): filled mint alert, or the danger alert
 *   for errors; white words, a close × at the right. Drops in with mp-slide-down.
 * - "callout" (inline info/warning inside a flow): flat mint-tinted box, 20px padding.
 */
export function Notice({
  tone,
  title,
  children,
  onDismiss,
  action,
  look,
  className,
}: {
  tone: NoticeTone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
  look?: "alert" | "callout";
  className?: string;
}) {
  const Icon = tone === "success" ? CheckIcon : tone === "info" ? InfoIcon : AlertIcon;
  const kind = look ?? (tone === "danger" ? "alert" : "callout");
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cx(
        "text-sm",
        kind === "alert" ? cx("mp-alert", tone === "danger" && "mp-alert--danger") : "mp-callout flex items-start gap-3",
        className,
      )}
    >
      <Icon size={20} className={cx("mt-px shrink-0", kind === "callout" && (tone === "danger" ? "text-danger-strong" : "text-brand-strong"))} />
      <div className="min-w-0 flex-1 break-words">
        {title && <p className="font-bold">{title}</p>}
        {children}
        {action && (
          <Button size="sm" variant="outline" className="mt-2" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      {onDismiss && (
        <button type="button" aria-label={title ? `Dismiss: ${title}` : "Dismiss"} className={kind === "alert" ? "mp-alert__close" : "mp-iconbtn mp-iconbtn--plain size-[30px] -my-1 -me-1"} onClick={onDismiss}>
          <CloseIcon size={18} />
        </button>
      )}
    </div>
  );
}
