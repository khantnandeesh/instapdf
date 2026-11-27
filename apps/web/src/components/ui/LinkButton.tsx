import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type LinkButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * "quiet" (default): a text action standing on its own line ("Back to pages", "Start over"):
   * 44px tall, Fredoka, underlined on hover. "inline": a link inside a sentence, always underlined.
   */
  kind?: "quiet" | "inline";
  /** "brand" (default) is berry; "inherit" takes the surrounding text colour (inside a tinted notice). */
  tone?: "brand" | "inherit";
};

/** A button that reads as a link: the one text-link action on every tool (never a styled raw <button>). */
export const LinkButton = forwardRef<HTMLButtonElement, LinkButtonProps>(function LinkButton({ kind = "quiet", tone = "brand", className, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      className={cx(
        "rounded-sm",
        kind === "quiet" ? "h-11 px-1 font-display font-medium underline-offset-4 hover:underline" : "font-semibold underline underline-offset-2",
        tone === "brand" && (kind === "quiet" ? "text-brand-strong" : "text-brand-strong hover:text-brand"),
        className,
      )}
    />
  );
});
