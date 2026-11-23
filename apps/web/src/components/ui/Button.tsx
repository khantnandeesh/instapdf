import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

/**
 * BerryPDF button variants (docs/design/berrypdf.md, Button):
 * - primary: the berry button, the one filled action per view: sits on a solid lip, lifts 1px on
 *   hover and presses 3px down onto the lip in 40ms
 * - ghost: pink tint on a pale lip ("Select", quiet dialog action)
 * - soft: small pink tint, no lip ("More options", in-app secondary actions)
 * - line: white with a berry outline (panel actions)
 * - outline / secondary: white with a grey-pink outline
 * - tool: working-mode editing tool (blueberry EditorToolbar look)
 * - plain: a berry text action
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "soft" | "line" | "outline" | "tool" | "plain";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "",
  secondary: "mp-btn--outline",
  outline: "mp-btn--outline",
  ghost: "mp-btn--ghost",
  soft: "mp-btn--soft",
  line: "mp-btn--line",
  tool: "mp-btn--tool",
  plain: "mp-btn--plain",
};

const sizes: Record<ButtonSize, string> = {
  sm: "mp-btn--sm",
  md: "",
  lg: "mp-btn--lg",
};

/** Shared base classes, also used by link-styled anchors that look like buttons. */
export function buttonClasses(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) {
  // sm only changes primary, ghost and outline: soft, line, tool and plain are already 14px.
  const sized = size === "sm" && !["primary", "ghost", "outline", "secondary"].includes(variant) ? "" : sizes[size];
  return cx("mp-btn", variants[variant], sized, extra);
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
