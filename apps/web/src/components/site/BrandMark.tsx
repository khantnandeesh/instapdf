/**
 * Our mark: an accent-strong rounded square with a folded page cut out of it.
 * Decorative; the wordmark beside it carries the name.
 */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <rect width="24" height="24" rx="6" fill="var(--ip-primary)" />
      <path d="M8 5.5h5.5L17 9v9.5H8z" fill="none" stroke="var(--ip-on-primary)" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M13.5 5.5V9H17" fill="none" stroke="var(--ip-on-primary)" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}
