import type { ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./icons";

export type NoticeTone = "info" | "success" | "warning" | "danger";

const tones: Record<NoticeTone, { box: string; icon: string }> = {
  info: { box: "bg-primary-soft", icon: "text-primary-ink" },
  success: { box: "bg-success-soft", icon: "text-success" },
  warning: { box: "bg-warning-soft", icon: "text-warning" },
  danger: { box: "bg-danger-soft", icon: "text-danger" },
};

export function Notice({
  tone,
  title,
  children,
  onDismiss,
  action,
  className,
}: {
  tone: NoticeTone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  const Icon = tone === "success" ? CheckIcon : tone === "info" ? InfoIcon : AlertIcon;
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cx("ip-edge flex items-start gap-3 rounded-lg p-3 text-sm text-fg", tones[tone].box, className)}
    >
      <Icon size={20} className={cx("mt-px shrink-0", tones[tone].icon)} />
      <div className="min-w-0 flex-1 break-words">
        {title && <p className="font-semibold">{title}</p>}
        {children}
        {action && (
          <Button size="sm" variant="secondary" className="mt-2" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      {onDismiss && (
        <IconButton
          label={title ? `Dismiss: ${title}` : "Dismiss"}
          tooltip={false}
          size="sm"
          className="-my-1 -me-1"
          icon={<CloseIcon size={18} />}
          onClick={onDismiss}
        />
      )}
    </div>
  );
}
