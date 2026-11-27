import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  /** Required accessible name; also the tooltip text. */
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
  pressed?: boolean;
  tooltip?: boolean;
  /**
   * "soft" (default for raised/secondary): BerryPDF's 34px round pink icon button (shrinks to 0.92 when pressed).
   * "ghost": no fill, a milk-pink round halo on hover. "onDark": 40px, on a dark scrim (the page preview).
   * "inherit": 26px, takes the surrounding text colour (the close on a tinted notice).
   */
  variant?: "ghost" | "secondary" | "raised" | "soft" | "onDark" | "inherit";
};

/**
 * Icon-only button. The hit area is always at least 44x44 px (a transparent ::before),
 * whatever the drawn size.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = "md", pressed, tooltip = true, variant = "ghost", className, type = "button", ...rest },
  ref,
) {
  const plain = variant === "ghost";
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      className={cx(
        "group/ib mp-iconbtn",
        plain && "mp-iconbtn--plain",
        plain && size === "sm" && "size-[34px]",
        variant === "onDark" && "mp-iconbtn--on-dark",
        variant === "inherit" && "mp-iconbtn--inherit",
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
            "pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 rounded-sm bg-inverse px-2 py-1 font-ui text-help whitespace-nowrap text-on-inverse",
            "ip-tooltip group-hover/ib:block group-focus-visible/ib:block [@media(hover:none)]:!hidden",
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
});
