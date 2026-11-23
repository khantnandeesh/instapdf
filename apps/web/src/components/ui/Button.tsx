import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary shadow-primary hover:bg-primary-hover active:bg-primary-active",
  secondary: "ip-tint ip-edge bg-surface-raised text-fg shadow-control hover:shadow-control-hover",
  ghost: "bg-transparent text-fg hover:bg-hover active:bg-pressed",
  danger: "bg-danger text-on-danger hover:bg-danger-hover",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-[52px] px-5 text-base gap-2",
};

/** Shared base classes, also used by link-styled anchors that look like buttons. */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) {
  return cx(
    "relative inline-flex select-none items-center justify-center rounded-md font-medium whitespace-nowrap",
    "transition-[background-color,color,transform] duration-(--ip-duration-fast) ease-out active:scale-[0.98]",
    "disabled:pointer-events-none disabled:bg-surface-sunken disabled:bg-none disabled:text-fg-disabled disabled:shadow-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", busy = false, iconStart, iconEnd, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} aria-busy={busy || undefined} className={buttonClasses(variant, size, className)} {...rest}>
      <span className={cx("inline-flex items-center gap-[inherit]", busy && "invisible")}>
        {iconStart}
        {children}
        {iconEnd}
      </span>
      {busy && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner size={20} />
        </span>
      )}
    </button>
  );
});
