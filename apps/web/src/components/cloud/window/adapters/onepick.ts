/**
 * Google's top-level Drive picker ("onepick"): the /cloud/google window navigates itself to Google's
 * OAuth page with `trigger_onepick=true`. Google shows its account chooser, a consent for the files
 * about to be picked, and the full Drive picker, all as top-level pages, so no third-party cookies
 * are involved (the embedded Picker iframe shows "Sign in" wherever they are blocked). Insert
 * redirects back to the bare `/cloud/google` URL with `#access_token=…&picked_file_ids=…&state=…`
 * (implicit flow: no client secret, no server). [V] 26 Nov 2026 on staging, owner's Chrome.
 *
 * The round trip keeps only a random nonce and the window's own URL in sessionStorage. On return,
 * `takeReturn` runs before anything else: it puts the window's own URL back with
 * history.replaceState (no reload, so the hash and its token never stay in the address bar or
 * history), checks the nonce, and holds the response in this module's memory for the adapter.
 * The mock provider uses the same code for its e2e round trip.
 */
const KEY = "berrypdf:cloud-onepick";

export type OnepickResult =
  | { kind: "picked"; token: string; ids: string[]; expiresIn: number }
  | { kind: "empty" }
  | { kind: "denied" }
  | { kind: "invalid" }
  | { kind: "failed" };

type Saved = { nonce: string; back: string };

let pending: OnepickResult | null = null;

const read = (): Saved | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Saved | null;
    return v && typeof v.nonce === "string" && typeof v.back === "string" ? v : null;
  } catch {
    return null;
  }
};

/**
 * Leaves for the provider with a fresh `state` (`route.nonce`). `url` is the provider's page (this
 * adds `state`), or a function building the URL from the state (the mock). Never resolves.
 */
export function start(url: string | ((state: string) => string), route: string): Promise<never> {
  const nonce = crypto.randomUUID();
  const state = `${route}.${nonce}`;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ nonce, back: location.href } satisfies Saved));
  } catch {}
  let to: string;
  if (typeof url === "string") {
    const u = new URL(url, location.href);
    u.searchParams.set("state", state);
    to = u.toString();
  } else to = url(state);
  location.assign(to);
  return new Promise<never>(() => {});
}

/** The bare redirect URL carries a onepick response (or an error for one) for this route. */
export function isReturn(hash: string, route: string): boolean {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  return (p.get("state") ?? "").startsWith(`${route}.`) && (p.has("access_token") || p.has("error"));
}

/**
 * Back from the provider: restores the window's own URL (with its request), clears the hash, and
 * keeps the checked response for `take()`. False when there is nothing to restore (no round trip
 * from this window), in which case the URL is cleared anyway and nothing is kept.
 */
export function takeReturn(route: string): boolean {
  const p = new URLSearchParams(location.hash.replace(/^#/, ""));
  const saved = read();
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
  let back: URL | null = null;
  try {
    back = saved ? new URL(saved.back) : null;
  } catch {}
  const ok = !!back && back.origin === location.origin && back.pathname === `/cloud/${route}`;
  // First, before anything reads the URL: the token leaves the address bar and this history entry.
  history.replaceState(null, "", ok ? `${back!.pathname}${back!.search}` : location.pathname);
  if (!ok) {
    pending = null;
    return false;
  }
  pending = parse(p, `${route}.${saved!.nonce}`);
  return true;
}

export function parse(p: URLSearchParams, state: string): OnepickResult {
  if (p.get("state") !== state) return { kind: "invalid" };
  const err = p.get("error");
  if (err) return { kind: err === "access_denied" ? "denied" : "failed" };
  const token = p.get("access_token");
  if (!token || (p.get("token_type") ?? "Bearer").toLowerCase() !== "bearer") return { kind: "failed" };
  const ids = (p.get("picked_file_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[\w-]{1,200}$/.test(s));
  if (!ids.length) return { kind: "empty" };
  return { kind: "picked", token, ids, expiresIn: Number(p.get("expires_in")) || 3600 };
}

/** The response `takeReturn` kept, once (then it is gone from memory too). */
export function take(): OnepickResult | null {
  const r = pending;
  pending = null;
  return r;
}

export const hasPending = () => pending !== null;
