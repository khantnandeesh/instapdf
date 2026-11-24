/**
 * The mock provider (CI/e2e; spec §7 fixtures, research §7.1). Same window, states and protocol as
 * the real providers, files from tests/fixtures served same-origin by /cloud-mock/<name>. It keeps
 * the fake token MOCK-TOKEN-F23 in memory only and never sends it anywhere, and records what it was
 * asked for in localStorage["berrypdf:cloud-mock-log"] (no tokens, no file bytes: names and hashes).
 */
import type { Adapter, AdapterCtx } from "./types";

export const MOCK_TOKEN = "MOCK-TOKEN-F23";
export const MOCK_LOG_KEY = "berrypdf:cloud-mock-log";
const FOLDER_KEY = "berrypdf:cloud-mock-folder";

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

export function createAdapter(ctx: AdapterCtx): Adapter {
  // Held like a real access token: in this window's memory only.
  let token: string | null = null;
  writeLog((l) => l.requests.push({ provider: ctx.params.provider, multiple: ctx.params.multiple, accept: ctx.params.accept, mode: ctx.params.mode ?? "pick" }));
  return {
    needsTap: ctx.params.provider !== "onedrive",
    prepare: async () => {},
    pick: async () => {
      token = MOCK_TOKEN;
      ctx.setPhase("picking");
      const r = await ctx.mockPick!();
      return r;
    },
    save: async (file, onProgress) => {
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
