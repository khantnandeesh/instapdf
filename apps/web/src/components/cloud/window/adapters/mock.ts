/**
 * The mock provider (CI/e2e; spec §7 fixtures, research §7.1). Same window, states and protocol as
 * the real providers, files from tests/fixtures served same-origin by /cloud-mock/<name>. It keeps
 * the fake token MOCK-TOKEN-F23 in memory only and never sends it anywhere, and records what it was
 * asked for in localStorage["berrypdf:cloud-mock-log"] (no tokens, no file bytes: names and hashes).
 */
import { FIXTURES, item } from "../MockPicker";
import * as onepick from "./onepick";
import type { Adapter, AdapterCtx } from "./types";
import { CloudError } from "./types";

export const MOCK_TOKEN = "MOCK-TOKEN-F23";
export const MOCK_LOG_KEY = "berrypdf:cloud-mock-log";
const FOLDER_KEY = "berrypdf:cloud-mock-folder";
/**
 * Set (by a test) to sign in like OneDrive: "1" is a full-page redirect to /cloud/mock#code=…&state=…
 * and back; "hold" leaves for a page that never comes back (a sign-in page the person closes).
 */
export const MOCK_REDIRECT_KEY = "berrypdf:cloud-mock-redirect";
/**
 * With MOCK_REDIRECT_KEY "onepick", picking goes the way of Google's top-level picker (onepick.ts):
 * out to "Google" and back to the bare /cloud/mock URL with a hash. This key says what comes back:
 * fixture names joined by "," (picked), "denied", "empty", or "badstate" (a state that isn't ours).
 */
export const MOCK_ONEPICK_KEY = "berrypdf:cloud-mock-onepick";
const SIGNED_KEY = "berrypdf:cloud-mock-signed";
const RETURN_KEY = "berrypdf:cloud-mock-return";

const session = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {}
  },
};

/** Back on the bare redirect URL: return to the window's own URL (as MSAL does). False: nothing to return to. */
export async function completeRedirect(): Promise<boolean> {
  const back = session.get(RETURN_KEY);
  if (!back || new URL(back, location.href).origin !== location.origin || !new URL(back, location.href).pathname.startsWith("/cloud/mock")) return false;
  session.set(SIGNED_KEY, "1");
  location.replace(back);
  return new Promise(() => {});
}

export type MockLog = {
  requests: { provider: string; multiple: boolean; accept: string[]; mode: string }[];
  downloads: string[];
  saved: { provider: string; name: string; size: number; sha256: string }[];
};

export function readLog(): MockLog {
  try {
    const v = JSON.parse(localStorage.getItem(MOCK_LOG_KEY) ?? "null") as MockLog | null;
    if (v && Array.isArray(v.requests)) return v;
  } catch {}
  return { requests: [], downloads: [], saved: [] };
}
export function writeLog(fn: (l: MockLog) => void) {
  const l = readLog();
  fn(l);
  try {
    localStorage.setItem(MOCK_LOG_KEY, JSON.stringify(l));
  } catch {}
}

/** What "Google" sends back to the bare redirect URL (IDs are fixture indexes, like Drive's opaque IDs). */
function onepickHash(outcome: string, state: string): string {
  const p = new URLSearchParams({ state: outcome === "badstate" ? "mock.00000000-0000-4000-8000-000000000000" : state });
  if (outcome === "denied") p.set("error", "access_denied");
  else {
    p.set("access_token", MOCK_TOKEN);
    p.set("token_type", "Bearer");
    p.set("expires_in", "3599");
    p.set("scope", "https://www.googleapis.com/auth/drive.file");
    const ids = outcome === "empty" || outcome === "badstate" ? [] : outcome.split(",").map((f) => String(FIXTURES.indexOf(f.trim())));
    p.set("picked_file_ids", (outcome === "badstate" ? ["0"] : ids).join(","));
  }
  return p.toString();
}

export function createAdapter(ctx: AdapterCtx): Adapter {
  // Held like a real access token: in this window's memory only.
  let token: string | null = null;
  /** Redirect sign-in mode: the first pick or save leaves for the sign-in page, then comes back here. */
  const signIn = async () => {
    let mode: string | null = null;
    try {
      mode = localStorage.getItem(MOCK_REDIRECT_KEY);
    } catch {}
    if ((mode !== "1" && mode !== "hold") || session.get(SIGNED_KEY) === "1") return;
    session.set(RETURN_KEY, location.href);
    ctx.leaving();
    location.assign(mode === "hold" ? "/" : `/cloud/mock#code=MOCK&state=${ctx.params.req}`);
    await new Promise(() => {}); // the page navigates away
  };
  writeLog((l) => l.requests.push({ provider: ctx.params.provider, multiple: ctx.params.multiple, accept: ctx.params.accept, mode: ctx.params.mode ?? "pick" }));
  return {
    needsTap: ctx.params.provider !== "onedrive" && !onepick.hasPending(), // back from onepick: straight on
    prepare: async () => {},
    pick: async () => {
      let mode: string | null = null;
      try {
        mode = localStorage.getItem(MOCK_REDIRECT_KEY);
      } catch {}
      if (mode === "onepick") {
        const r = onepick.take();
        if (!r) {
          let outcome = "alpha.pdf";
          try {
            outcome = localStorage.getItem(MOCK_ONEPICK_KEY) ?? outcome;
          } catch {}
          ctx.leaving();
          return onepick.start((state) => `/cloud/mock#${onepickHash(outcome, state)}`, "mock");
        }
        if (r.kind === "empty") return "cancel";
        if (r.kind === "denied") throw new CloudError("denied");
        if (r.kind !== "picked") throw new CloudError("unreachable");
        token = r.token;
        return r.ids.map((n, i) => item(`f${i + 1}`, FIXTURES[Number(n)] ?? "alpha.pdf"));
      }
      await signIn();
      token = MOCK_TOKEN;
      ctx.setPhase("picking");
      const r = await ctx.mockPick!();
      return r;
    },
    save: async (file, onProgress) => {
      await signIn();
      token = token ?? MOCK_TOKEN;
      const total = file.size;
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 120));
        onProgress(Math.round((total * i) / 4), total);
      }
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      // Never overwrite: a name that exists gets " (1)", " (2)"… (AC-164).
      let names: string[] = [];
      try {
        names = JSON.parse(localStorage.getItem(FOLDER_KEY) ?? "[]") as string[];
      } catch {}
      let name = file.name;
      const dot = name.lastIndexOf(".");
      for (let n = 1; names.includes(name); n++) name = dot > 0 ? `${file.name.slice(0, dot)} (${n})${file.name.slice(dot)}` : `${file.name} (${n})`;
      names.push(name);
      try {
        localStorage.setItem(FOLDER_KEY, JSON.stringify(names));
      } catch {}
      writeLog((l) => l.saved.push({ provider: ctx.params.provider, name, size: file.size, sha256 }));
      void token;
      return { name, link: "https://example.com/berrypdf-mock-folder" };
    },
  };
}
