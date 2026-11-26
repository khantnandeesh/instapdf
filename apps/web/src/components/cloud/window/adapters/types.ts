/** A provider adapter, run only inside its own /cloud/<provider> window (research §3.1). */
import type { DownloadRequest } from "@/lib/cloud/download";
import type { WindowParams } from "@/lib/cloud/protocol";
import type { CloudProvider } from "@/lib/cloud/providers";

export type Picked = {
  id: string;
  name: string;
  size: number;
  request: () => Promise<DownloadRequest>;
  /** A Google document exported as PDF: a refused export is "too large to export" (AC-141). */
  native?: boolean;
};

export type Phase = "signing" | "picking" | "connecting";

export type FrameSpec = { url: string } | { post: { action: string; fields: Record<string, string> } };

export type AdapterCtx = {
  params: WindowParams & { provider: CloudProvider };
  setPhase: (p: Phase) => void;
  /** Shows the provider's own picker in our iframe under the window header; null removes it. */
  frame: (spec: FrameSpec | null, title?: string) => Promise<HTMLIFrameElement | null>;
  /** Before a full-page sign-in redirect (OneDrive). */
  leaving: () => void;
  /**
   * The provider's picker has said nothing since it loaded (Google: its own "You must sign in" page,
   * which we can't read): the window shows its "couldn't open" state.
   */
  trouble?: () => void;
  /** Mock only: shows the test picker and resolves with what was chosen. */
  /** "quiet": the test picker stays up and silent, like Google's blocked picker (the mock runs the real watchdog). */
  mockPick?: () => Promise<Picked[] | "cancel" | "quiet">;
};

export type Adapter = {
  /** Google and Dropbox SDKs must be called from a tap in this window. */
  needsTap: boolean;
  /** Loads the provider's script (after the disclosure is on screen). */
  prepare: () => Promise<void>;
  /** Starts synchronously (inside the tap); resolves with the picked files or "cancel". */
  pick: () => Promise<Picked[] | "cancel">;
  /** Uploads the result into the provider (save mode). */
  save?: (file: File, onProgress: (loaded: number, total: number) => void) => Promise<{ name: string; link?: string }>;
};

/** A sign-in response (`#code=…&state=…` or `#error=…&state=…`) on the bare redirect URL (OneDrive, and the mock's redirect mode). */
export const isSignInResponse = (hash: string, search: string) =>
  [hash.slice(1), search.slice(1)].some((q) => {
    const p = new URLSearchParams(q);
    return p.has("state") && (p.has("code") || p.has("error"));
  });

/**
 * "signin": the provider's sign-in didn't work for this window (an expired or refused session, an
 * account without access). The window handles it itself, with Try again and Choose from this device;
 * the tool tab is not told (it keeps waiting, and the person can still cancel there).
 */
export class CloudError extends Error {
  constructor(readonly code: "denied" | "unreachable" | "signin") {
    super(code);
  }
}

/** Adds a provider script once (its host is in this window's CSP only). */
export function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new CloudError("unreachable"));
    document.head.append(s);
  });
}

/** XHR upload with progress (fetch has no upload progress); the URL's host must be in connect-src. */
export function xhrUpload(method: string, url: string, body: Blob | FormData, headers: Record<string, string>, onProgress: (l: number, t: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => onProgress(e.loaded, e.total || (body instanceof Blob ? body.size : 0));
    x.onload = () => {
      if (x.status === 401 || x.status === 403) return reject(new CloudError("denied"));
      if (x.status < 200 || x.status >= 300) return reject(new CloudError("unreachable"));
      try {
        resolve(JSON.parse(x.responseText));
      } catch {
        resolve({});
      }
    };
    x.onerror = () => reject(new CloudError("unreachable"));
    x.send(body);
  });
}
