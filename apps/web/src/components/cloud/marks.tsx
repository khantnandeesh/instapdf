import { configuredProviders, type CloudProvider } from "@/lib/cloud/providers";

/**
 * Provider marks (spec U-10): the only multi-colour icons in the product; never on a tile.
 * TODO(F23): replace these simplified placeholders with each provider's official mark from its
 * brand kit (Google Drive product icon, Dropbox glyph, OneDrive icon), after checking each kit's
 * terms, and list them as trademarks in THIRD-PARTY-NOTICES.md.
 */
function art(provider: CloudProvider) {
  return provider === "google" ? (
    <>
      <path fill="#1FA463" d="M8 3.2 1.2 15l3.4 5.8L11.4 9z" />
      <path fill="#FFD04B" d="M8 3.2h7.9L22.8 15h-7.8z" />
      <path fill="#4687F4" d="M4.6 20.8 8 15h14.8l-3.4 5.8z" />
    </>
  ) : provider === "dropbox" ? (
    <path fill="#0061FF" d="m7 2.6-5.5 3.5L7 9.6l5-3.5zm10 0-5 3.5 5 3.5 5.5-3.5zM1.5 13.1 7 16.6l5-3.5-5-3.5zm15.5-3.5-5 3.5 5 3.5 5.5-3.5zM7 17.8l5 3.5 5-3.5-5-3.4z" />
  ) : (
    <>
      <path fill="#0364B8" d="M9.6 8.4a5.6 5.6 0 0 1 9.9 2.3 4.3 4.3 0 0 1 1.6 8H8.4z" />
      <path fill="#0078D4" d="M9.5 8.3A6.3 6.3 0 0 0 3.6 12.6 3.8 3.8 0 0 0 5 19h6.7l6.2-6.4z" />
      <path fill="#1490DF" d="M5 19h15a3.6 3.6 0 0 0 1.9-6.4L13.5 12z" />
      <path fill="#28A8EA" d="M19.5 10.7a4.3 4.3 0 0 1 2.4 1.9L12 19H5c-1 0-2-.4-2.6-1.1l7-7.2a5.3 5.3 0 0 1 3.8-1.4c2.4 0 4.8 0 6.3.4z" opacity=".9" />
    </>
  );
}

/**
 * The marks as a sprite, rendered by the tool pages (server components: markup only, no JavaScript).
 * ProviderMark draws from it. Nothing when cloud sources are off or no provider is configured.
 */
export function CloudSprite() {
  const providers = configuredProviders();
  if (!providers.length) return null;
  return (
    <svg width="0" height="0" className="mp-sprite" aria-hidden="true" focusable="false">
      {providers.map((p) => (
        <symbol key={p} id={`ip-mark-${p}`} viewBox="0 0 24 24">
          {art(p)}
        </symbol>
      ))}
    </svg>
  );
}

/** A mark drawn in full, for pages without the sprite (the cloud window). */
export function ProviderArt({ provider, size = 20, className }: { provider: CloudProvider; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} data-mark={provider}>
      {art(provider)}
    </svg>
  );
}
