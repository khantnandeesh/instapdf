/**
 * Google Drive in the /cloud/google window (research §3.1): Google Identity Services token client
 * (scope drive.file only), then the Picker built with PickerBuilder.toUri() and shown in our own
 * iframe (so no inline styles are needed under style-src 'self'). Files download from Drive v3
 * (files.get alt=media) with the token, which lives in this window's memory only.
 * Save: multipart upload into a "BerryPDF" folder the app creates (drive.file sees only that).
 * [U] untested with real credentials; the toUri() callback format is not documented in detail, so
 * the message parser below accepts the documented response shape wherever it appears.
 */
import type { Adapter, AdapterCtx, Picked } from "./types";
import { exportName, exportUrl, isNative, nativeMimes } from "./native";
import { CloudError, loadScript, xhrUpload } from "./types";

type TokenResponse = { access_token?: string; expires_in?: number | string; error?: string };
type Gis = {
  accounts: {
    oauth2: {
      initTokenClient: (o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string }) => void }) => {
        requestAccessToken: (o?: { prompt?: string; login_hint?: string }) => void;
      };
    };
  };
  picker: Record<string, unknown> & {
    DocsView: new (viewId?: unknown) => { setMimeTypes(m: string): unknown; setIncludeFolders(b: boolean): unknown; setSelectFolderEnabled(b: boolean): unknown; setMode(m: unknown): unknown };
    PickerBuilder: new () => Record<string, (...a: unknown[]) => unknown> & { toUri: () => string };
    ViewId: { DOCS: unknown };
    DocsViewMode: { LIST: unknown };
    Feature: { MULTISELECT_ENABLED: unknown };
  };
};
type Gapi = { load: (m: string, o: { callback: () => void; onerror: () => void }) => void };

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

type PickerDoc = { id: string; name: string; sizeBytes?: number | string; mimeType?: string };

/** Finds the Picker's response ({ action, docs }) in a message from docs.google.com. */
export function findPickerResponse(data: unknown, depth = 0): { action: string; docs: PickerDoc[] } | null {
  if (depth > 6 || data == null) return null;
  if (typeof data === "string") {
    try {
      return findPickerResponse(JSON.parse(data), depth + 1);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.action === "string" && (o.action === "picked" || o.action === "cancel")) {
    const docs = Array.isArray(o.docs) ? (o.docs as PickerDoc[]).filter((d) => d && typeof d.id === "string" && typeof d.name === "string") : [];
    return { action: o.action, docs };
  }
  for (const v of Object.values(o)) {
    const hit = findPickerResponse(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * The Picker frame URL. toUri() drops the app ID (build() sends it as `appId`); without it Drive
 * does not grant this app drive.file access to the files picked, so the download would 404.
 * `authuser` pins the Picker to the token's account: in a browser signed in to several Google
 * accounts it otherwise uses the default account's session, which is not the token's
 * (PickerBuilder.setAuthUser does the same, but it is undocumented). Parameters are appended,
 * so the rest of toUri()'s query stays byte for byte.
 */
export function pickerUrl(base: string, { appId = "", authUser = "" }: { appId?: string; authUser?: string } = {}): string {
  const cut = base.indexOf("#");
  let url = cut < 0 ? base : base.slice(0, cut); // parameters go before any #fragment
  const hash = cut < 0 ? "" : base.slice(cut);
  const has = new URL(url).searchParams;
  const add = (k: string, v: string) => {
    if (v && !has.has(k)) url += `${url.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;
  };
  add("appId", appId);
  add("authuser", authUser);
  return url + hash;
}

/** The email of the account a drive.file token belongs to (Drive about.get), or "" if unknown. */
async function tokenEmail(token: string): Promise<string> {
  try {
    const r = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000), // never hold the Picker back: it opens without authuser
    });
    if (!r.ok) return "";
    const j = (await r.json()) as { user?: { emailAddress?: string } };
    return typeof j.user?.emailAddress === "string" ? j.user.emailAddress : "";
  } catch {
    return "";
  }
}

export function createAdapter(ctx: AdapterCtx): Adapter {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "";
  const g = () => (window as Window & { google?: Gis }).google;
  let token: string | null = null; // memory only (spec AC-129)
  let expires = 0; // ms epoch; a minute early so a save never starts on a dying token
  let email = ""; // the token's account, for the Picker's authuser
  let pending: { resolve: (t: string) => void; reject: (e: unknown) => void } | null = null;
  let client: ReturnType<Gis["accounts"]["oauth2"]["initTokenClient"]> | null = null;

  const getToken = (): Promise<string> =>
    new Promise((resolve, reject) => {
      if (token && Date.now() < expires) return resolve(token);
      token = null;
      if (!client) return reject(new CloudError("unreachable"));
      pending = { resolve, reject };
      ctx.setPhase("signing");
      client.requestAccessToken(email ? { prompt: "", login_hint: email } : { prompt: "" }); // synchronously inside the tap; a renewal stays on the same account
    });

  return {
    needsTap: true,
    prepare: async () => {
      await Promise.all([loadScript("https://apis.google.com/js/api.js"), loadScript("https://accounts.google.com/gsi/client")]);
      const gapi = (window as Window & { gapi?: Gapi }).gapi;
      if (!gapi || !g()) throw new CloudError("unreachable");
      await new Promise<void>((resolve, reject) => gapi.load("picker", { callback: resolve, onerror: () => reject(new CloudError("unreachable")) }));
      client = g()!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          const p = pending;
          pending = null;
          if (r.error || !r.access_token) p?.reject(new CloudError("denied"));
          else {
            token = r.access_token;
            email = ""; // re-read: the user may have chosen another account
            expires = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60_000;
            p?.resolve(token);
          }
        },
        // Closing Google's window is a cancel, never a second window (spec §5).
        error_callback: (e) => {
          const p = pending;
          pending = null;
          p?.reject(e?.type === "popup_closed" ? "cancel" : new CloudError(e?.type === "popup_failed_to_open" ? "unreachable" : "denied"));
        },
      });
    },
    pick: async () => {
      let t: string;
      try {
        t = await getToken();
      } catch (e) {
        if (e === "cancel") return "cancel";
        throw e;
      }
      const gp = g()!.picker;
      // Google Docs, Sheets and Slides too where the tool takes PDFs: Drive exports them (AC-141).
      const mimes = [...ctx.params.accept.map((e) => MIME[e]).filter(Boolean), ...nativeMimes(ctx.params.accept)].join(",");
      const view = new gp.DocsView(gp.ViewId.DOCS);
      view.setMimeTypes(mimes);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(false);
      view.setMode(gp.DocsViewMode.LIST);
      const b = new gp.PickerBuilder();
      b.addView(view);
      b.setOAuthToken(t);
      b.setDeveloperKey(apiKey);
      b.setAppId(appId);
      b.setOrigin(window.location.origin);
      if (ctx.params.multiple) b.enableFeature(gp.Feature.MULTISELECT_ENABLED);
      email ||= await tokenEmail(t); // memory only, like the token
      if (email && typeof b.setAuthUser === "function") b.setAuthUser(email);
      const url = pickerUrl(b.toUri(), { appId, authUser: email });
      ctx.setPhase("picking");
      const frame = await ctx.frame({ url }, "Google Drive");
      return new Promise<Picked[] | "cancel">((resolve) => {
        const onMessage = (e: MessageEvent) => {
          if (e.origin !== "https://docs.google.com" || (frame && e.source !== frame.contentWindow)) return;
          const r = findPickerResponse(e.data);
          if (!r) return;
          window.removeEventListener("message", onMessage);
          void ctx.frame(null);
          if (r.action === "cancel") return resolve("cancel");
          resolve(
            r.docs.map((d, i): Picked =>
              isNative(d.mimeType)
                ? {
                    id: `f${i + 1}`,
                    name: exportName(d.name),
                    size: 0, // unknown until exported
                    native: true,
                    request: async () => ({ url: exportUrl(d.id), headers: { Authorization: `Bearer ${t}` }, name: exportName(d.name), type: "application/pdf" }),
                  }
                : {
                    id: `f${i + 1}`,
                    name: d.name,
                    size: Number(d.sizeBytes) || 0,
                    request: async () => ({
                      url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(d.id)}?alt=media`,
                      headers: { Authorization: `Bearer ${t}` },
                      name: d.name,
                      type: d.mimeType,
                      total: Number(d.sizeBytes) || undefined,
                    }),
                  },
            ),
          );
        };
        window.addEventListener("message", onMessage);
      });
    },
    save: async (file, onProgress) => {
      const t = await getToken();
      const auth = { Authorization: `Bearer ${t}` };
      // The "BerryPDF" folder (drive.file: the app can see only folders it created).
      const q = encodeURIComponent("name='BerryPDF' and mimeType='application/vnd.google-apps.folder' and trashed=false");
      const list = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers: auth });
      if (list.status === 401 || list.status === 403) throw new CloudError("denied");
      let folder = ((await list.json()) as { files?: { id: string }[] }).files?.[0]?.id;
      if (!folder) {
        const made = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "BerryPDF", mimeType: "application/vnd.google-apps.folder" }),
        });
        if (!made.ok) throw new CloudError(made.status === 403 ? "denied" : "unreachable");
        folder = ((await made.json()) as { id: string }).id;
      }
      // Drive never overwrites: a second file with the same name is a separate file (AC-164).
      const body = new FormData();
      body.append("metadata", new Blob([JSON.stringify({ name: file.name, parents: [folder] })], { type: "application/json" }));
      body.append("file", file);
      const r = (await xhrUpload("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", body, auth, onProgress)) as {
        name?: string;
        webViewLink?: string;
      };
      return { name: r.name ?? file.name, link: r.webViewLink };
    },
  };
}
