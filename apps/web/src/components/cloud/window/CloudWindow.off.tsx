import type { CloudRoute } from "@/lib/cloud/providers";

/** F23 off: next.config.ts swaps this in for CloudWindow, so no window or adapter code is built. */
export function CloudWindow(props: { route: CloudRoute; toolTitles: readonly string[] }) {
  void props;
  return null;
}
