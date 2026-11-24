/**
 * The last used source (spec U-12, AC-166): localStorage["berrypdf:cloud-last"] holds one word,
 * a provider id or "device", and nothing else. A pre-paint <head> script copies a configured
 * provider into <html data-cloud-last>, so the cloud row is laid out right in the first paint
 * (no hydration difference, no layout shift). Every storage access is wrapped.
 */
import { isProvider, type CloudProvider } from "./providers";

export const CLOUD_LAST_KEY = "berrypdf:cloud-last";
export type LastSource = CloudProvider | "device";

/** A stored value that is one of the configured providers, else null. */
export function parseLast(raw: string | null | undefined, configured: readonly CloudProvider[]): CloudProvider | null {
  return isProvider(raw) && configured.includes(raw) ? raw : null;
}

export function readLast(configured: readonly CloudProvider[]): CloudProvider | null {
  try {
    return parseLast(window.localStorage.getItem(CLOUD_LAST_KEY), configured);
  } catch {
    return null;
  }
}

export function writeLast(source: LastSource) {
  try {
    window.localStorage.setItem(CLOUD_LAST_KEY, source);
  } catch {}
  try {
    if (source === "device") document.documentElement.removeAttribute("data-cloud-last");
    else document.documentElement.setAttribute("data-cloud-last", source);
  } catch {}
}

/** The inline pre-paint script (hashed into the CSP by scripts/csp-manifest.mjs). */
export function cloudPrepaintScript(configured: readonly CloudProvider[]): string {
  return `try{var v=localStorage.getItem(${JSON.stringify(CLOUD_LAST_KEY)});if(${JSON.stringify(configured)}.indexOf(v)>-1)document.documentElement.setAttribute("data-cloud-last",v)}catch(e){}`;
}
