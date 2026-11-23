import { cx } from "../ui/cx";

/**
 * Our mark on Mint Paper: a 30px mint disc with a folded page cut out of it. Decorative; the
 * wordmark beside it carries the name. Inside a `group` link it spins one turn and scales to 1.1
 * on hover (0.3s ease-in-out), the only playful motion in the chrome.
 */
export function BrandMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      aria-hidden="true"
      className={cx("shrink-0 transition-transform duration-(--dur-move) ease-standard group-hover:[transform:rotate(1turn)_scale(1.1)]", className)}
    >
      <circle cx="15" cy="15" r="15" fill="var(--brand)" />
      <path d="M10.5 8h6l3.5 3.5V22h-9.5z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16.5 8v3.5H20" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark + "InstaPDF" in mint (brand-strong, 4.95:1); the name fades to brand on hover over 1s. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-nav text-brand-strong", className)}>
      <BrandMark />
      <span className="transition-colors duration-(--dur-attention) ease-standard group-hover:text-brand">InstaPDF</span>
    </span>
  );
}
