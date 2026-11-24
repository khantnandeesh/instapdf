import type { ReactNode } from "react";
import { Button, buttonClasses } from "./Button";
import { cx } from "./cx";
import { AlertIcon, CheckCircleIcon, CloseIcon, ErrorIcon, InfoIcon, LeafIcon } from "./icons";

export type NoticeTone = "info" | "success" | "warning" | "danger";

/**
 * BerryPDF Alert and Callout.
 * - "alert" (floating notices, and every danger notice): a soft tinted alert that drops in from the
 *   top (0.9s). Success is leaf green on pale green, errors brick red on pale red, information and
 *   warnings blueberry on pale blue; each with its own icon and bold words, so colour is never the
 *   only signal. A round close button on the right.
 * - "callout" (inline info/warning inside a flow): the gentle aside, a pink band with a sand outline,
 *   a small leaf (info) or warning icon on the left.
 */
export function Notice({
  tone,
  title,
  children,
  onDismiss,
  action,
  look,
  className,
  inlineAction,
  busy,
}: {
  tone: NoticeTone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  action?: { label: string; onClick?: () => void; href?: string; autoFocus?: boolean };
  look?: "alert" | "callout";
  className?: string;
  /** The action sits on the alert's row, before the close (F23 short alerts). */
  inlineAction?: boolean;
  /** A small busy ring replaces the icon (waiting). */
  busy?: boolean;
}) {
  const kind = look ?? (tone === "danger" ? "alert" : "callout");
  const Icon =
    kind === "alert"
      ? tone === "success"
        ? CheckCircleIcon
        : tone === "danger"
          ? ErrorIcon
          : tone === "warning"
            ? AlertIcon
            : InfoIcon
      : tone === "danger"
        ? ErrorIcon
        : tone === "warning"
          ? AlertIcon
          : LeafIcon;
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cx(
        "text-sm",
        kind === "alert" ? cx("mp-alert", tone === "danger" && "mp-alert--danger", (tone === "info" || tone === "warning") && "mp-alert--info") : "mp-callout items-start",
        className,
      )}
    >
      {busy ? (
        <span className="ip-busy-ring" aria-hidden="true" />
      ) : (
        <Icon
          size={22}
          className={cx("shrink-0", kind === "callout" && (tone === "danger" ? "text-danger" : tone === "warning" ? "text-brand-strong" : "text-leaf"))}
        />
      )}
      <div className="min-w-0 flex-1 break-words">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(kind === "alert" && title && "font-normal")}>{children}</div>}
        {action && !inlineAction && <NoticeAction action={action} className="mt-2" />}
      </div>
      {action && inlineAction && <NoticeAction action={action} className="-my-1 shrink-0 self-center" />}
      {onDismiss && (
        <button
          type="button"
          aria-label={title ? `Dismiss: ${title}` : "Dismiss"}
          className={kind === "alert" ? "mp-alert__close" : "mp-iconbtn mp-iconbtn--plain -my-1 -me-1 size-[30px]"}
          onClick={onDismiss}
        >
          <CloseIcon size={18} />
        </button>
      )}
    </div>
  );
}

function NoticeAction({ action, className }: { action: { label: string; onClick?: () => void; href?: string; autoFocus?: boolean }; className?: string }) {
  if (action.href)
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm", className)} onClick={action.onClick} autoFocus={action.autoFocus}>
        {action.label}
      </a>
    );
  return (
    <Button size="sm" variant="outline" className={className} onClick={action.onClick} autoFocus={action.autoFocus}>
      {action.label}
    </Button>
  );
}
