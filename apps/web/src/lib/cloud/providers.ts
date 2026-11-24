/**
 * F23 cloud sources: which providers this build offers (spec §3 "Feature flag", §8a "Flag").
 *
 * Every value is a public `NEXT_PUBLIC_*` build variable (inlined at build time, so each
 * `process.env.X` below must stay a literal property access). None of them is a secret.
 * - `NEXT_PUBLIC_CLOUD_SOURCES=1` turns the feature on. Off: nothing renders, no /cloud page is built.
 * - A provider shows only when its public IDs are set (AC-124).
 * - `NEXT_PUBLIC_CLOUD_MOCK=1` routes every provider to the same-origin `/cloud/mock` window (CI, e2e).
 *   Without it the mock exists only in `next dev` (never in a production build).
 */

import { PROVIDERS, providerList, providerName, type CloudProvider } from "./names";

export { PROVIDERS, providerList, providerName, type CloudProvider };
/** A `/cloud/<route>` window. */
export type CloudRoute = CloudProvider | "mock";
/** Short names for the save button ("Save to Drive"). */
export const providerShort: Record<CloudProvider, string> = { google: "Drive", dropbox: "Dropbox", onedrive: "OneDrive" };
/** Providers the result screen can save to (no Dropbox: its Saver needs a public URL, spec D-5). */
export const SAVE_PROVIDERS: readonly CloudProvider[] = ["google", "onedrive"];

export type CloudEnv = {
  flag?: string;
  mock?: string;
  production?: boolean;
  dropboxAppKey?: string;
  googleClientId?: string;
  googleApiKey?: string;
  googleAppId?: string;
  onedriveClientId?: string;
};

export function readCloudEnv(): CloudEnv {
  return {
    flag: process.env.NEXT_PUBLIC_CLOUD_SOURCES,
    mock: process.env.NEXT_PUBLIC_CLOUD_MOCK,
    production: process.env.NODE_ENV === "production",
    dropboxAppKey: process.env.NEXT_PUBLIC_DROPBOX_APP_KEY,
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    googleApiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
    googleAppId: process.env.NEXT_PUBLIC_GOOGLE_APP_ID,
    onedriveClientId: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID,
  };
}

const set = (v: string | undefined) => !!v && v.trim() !== "";

export function cloudEnabled(env: CloudEnv = readCloudEnv()): boolean {
  return env.flag === "1";
}

/** The mock window stands in for every provider: CI/e2e builds (`NEXT_PUBLIC_CLOUD_MOCK=1`), or `next dev` with the flag on. */
export function mockActive(env: CloudEnv = readCloudEnv()): boolean {
  if (!cloudEnabled(env)) return false;
  if (env.mock === "1") return true;
  return !env.production && env.mock !== "0";
}

function hasKeys(p: CloudProvider, env: CloudEnv): boolean {
  if (p === "dropbox") return set(env.dropboxAppKey);
  if (p === "google") return set(env.googleClientId) && set(env.googleApiKey) && set(env.googleAppId);
  return set(env.onedriveClientId);
}

/** Providers to show, in the fixed menu order (Google Drive, Dropbox, OneDrive). */
export function configuredProviders(env: CloudEnv = readCloudEnv()): CloudProvider[] {
  if (!cloudEnabled(env)) return [];
  if (mockActive(env)) return [...PROVIDERS];
  return PROVIDERS.filter((p) => hasKeys(p, env));
}

/**
 * The flag as the build applies it (next.config.ts sets NEXT_PUBLIC_CLOUD_SOURCES from this): on only
 * when at least one provider is configured. A build with the flag but no provider keys yet (or only
 * some of a provider's) is then exactly a build without it: no caret, no row, no cloud chunk.
 */
export function cloudSourcesOn(env: CloudEnv = readCloudEnv()): boolean {
  return configuredProviders(env).length > 0;
}

/** The `/cloud/<route>` pages this build has (for generateStaticParams). */
export function cloudRoutes(env: CloudEnv = readCloudEnv()): CloudRoute[] {
  if (!cloudEnabled(env)) return [];
  if (mockActive(env)) return ["mock"];
  return configuredProviders(env);
}

/** Which window serves a provider in this build. */
export function routeFor(provider: CloudProvider, env: CloudEnv = readCloudEnv()): CloudRoute {
  return mockActive(env) ? "mock" : provider;
}

export function isProvider(v: unknown): v is CloudProvider {
  return typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);
}

export function isRoute(v: unknown): v is CloudRoute {
  return v === "mock" || isProvider(v);
}
