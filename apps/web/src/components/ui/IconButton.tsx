import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /** Required accessible name; also the tooltip text. */
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
  pressed?: boolean;
  tooltip?: boolean;
  variant?: "ghost" | "secondary" | "raised";
};

/**
 * Icon-only button. The hit area is always at least 44x44 px: the `sm` size is
 * 32 px visually and gets its extra hit area from a transparent pseudo-element.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = "md", pressed, tooltip = true, variant = "ghost", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={cx(
        "group/ib inline-grid shrink-0 place-items-center rounded-md text-fg",
        "transition-[background-color,transform] duration-(--ip-duration-fast) active:scale-[0.96]",
        "disabled:pointer-events-none disabled:text-fg-disabled",
        "before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
        size === "sm" ? "size-8" : "size-11",
        variant === "ghost" && "hover:bg-hover active:bg-pressed",
        variant === "secondary" && "ip-tint bg-surface-raised shadow-control",
        variant === "raised" && "ip-tint bg-surface-overlay",
        pressed && "bg-primary-soft text-primary-ink",
        /\babsolute\b/.test(className ?? "") ? className : cx("relative", className),
      )}
      {...rest}
    >
      {icon}
      {tooltip && (
        <span
          aria-hidden="true"
          className={cx(
            // Not rendered until hover/focus, so an off-screen tooltip never widens the page.
            "pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 rounded-sm bg-inverse px-2 py-1 text-xs font-medium whitespace-nowrap text-on-inverse",
            "ip-tooltip group-hover/ib:block group-focus-visible/ib:block [@media(hover:none)]:!hidden",
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
});
