import type { CloudProvider } from "@/lib/cloud/names";

/**
 * A provider mark on a tool page: inline SVG drawing the page's mark sprite (CloudSprite, in marks.tsx,
 * server-rendered by the tool page), so it draws on first paint with no request and no img-src change
 * (spec U-10, AC-121) and the artwork never ships as JavaScript.
 */
export function ProviderMark({ provider, size = 20, className }: { provider: CloudProvider; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} data-mark={provider}>
      <use href={`#ip-mark-${provider}`} />
    </svg>
  );
}
