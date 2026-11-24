/**
 * F23 provider names, apart from providers.ts so a tool page's own code (cloud/tool-cloud.tsx) carries
 * only these few words. `buildProviders` and `buildNames` are what next.config.ts worked out from the
 * flag and keys (configuredProviders), inlined at build time.
 */
export const PROVIDERS = ["google", "dropbox", "onedrive"] as const;
export type CloudProvider = (typeof PROVIDERS)[number];

export const providerName: Record<CloudProvider, string> = { google: "Google Drive", dropbox: "Dropbox", onedrive: "OneDrive" };

/** "Google Drive, Dropbox or OneDrive". */
export function providerList(list: readonly CloudProvider[]): string {
  const names = list.map((p) => providerName[p]);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** The providers this build shows, in the fixed order, and their names as a list ("Google Drive, Dropbox or OneDrive"): build-time constants (next.config.ts). */
export const buildNames = (): string => process.env.NEXT_PUBLIC_CLOUD_NAMES || "";
export const buildProviders = (): CloudProvider[] => (process.env.NEXT_PUBLIC_CLOUD_LIST || "").split(",").filter(Boolean) as CloudProvider[];
