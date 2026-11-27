import type { ReactNode } from "react";
import { Button } from "./Button";
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
}: {
  tone: NoticeTone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  /** F23 adds `node` (a rendered action in place of the button) and `icon` (in place of the notice's own); cloud/NoticeAction.tsx. */
  action?: { label: string; onClick: () => void; node?: ReactNode; icon?: ReactNode };
  look?: "alert" | "callout";
  className?: string;
}) {
  const kind = look ?? (tone === "danger" ? "alert" : "callout");
  // F23: an action of its own (cloud/NoticeAction.tsx) sits on the notice's row, before the close (spec U-4).
  const inline = process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && action?.node ? action.node : null;
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
        // Written out so that builds without cloud sources fold this to main's `className`.
        process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && inline !== null ? cx("ip-notice-inline", className) : className,
      )}
    >
      {/* F23 reads `icon` and `node` only behind the build flag, written out: builds without cloud sources compile to main's code. */}
      {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && action?.icon ? (
        action.icon
      ) : (
        <Icon
          size={22}
          className={cx("shrink-0", kind === "callout" && (tone === "danger" ? "text-danger" : tone === "warning" ? "text-brand-strong" : "text-leaf"))}
        />
      )}
      <div className="min-w-0 flex-1 break-words text-pretty">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(kind === "alert" && title && "font-normal")}>{children}</div>}
        {action &&
          (process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" && inline !== null ? null : (
            <Button size="sm" variant="outline" className="mt-2" onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
      </div>
      {/* F23: the action goes before the close. The close is written out twice so that builds without cloud
          sources keep main's children exactly (the second branch is main's code). */}
      {process.env.NEXT_PUBLIC_CLOUD_SOURCES === "1" ? (
        <>
          {inline}
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
        </>
      ) : (
        onDismiss && (
          <button
            type="button"
            aria-label={title ? `Dismiss: ${title}` : "Dismiss"}
            className={kind === "alert" ? "mp-alert__close" : "mp-iconbtn mp-iconbtn--plain -my-1 -me-1 size-[30px]"}
            onClick={onDismiss}
          >
            <CloseIcon size={18} />
          </button>
        )
      )}
    </div>
  );
}
