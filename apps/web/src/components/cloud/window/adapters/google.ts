/**
 * Google Drive in the /cloud/google window (research §3.1).
 * Pick: Google's top-level picker (onepick.ts). The window navigates itself to Google's OAuth page
 * with `trigger_onepick=true` (scope drive.file only) and comes back with the picked file IDs and a
 * token, which lives in this window's memory only. No third-party cookies, script or iframe: the
 * embedded Picker needed Google's cookies in a third-party frame and showed "Sign in" wherever
 * they were blocked. Files download from Drive v3 (files.get alt=media, Docs/Sheets/Slides exported
 * as PDF) in this window; only their bytes go to the tool tab.
 * Save: a Google Identity Services token (popup, drive.file), then a multipart upload into a
 * "BerryPDF" folder the app creates (drive.file sees only that).
 * [V] 26 Nov 2026: onepick round trip and alt=media download on staging with a real account.
 */
import type { Adapter, AdapterCtx, Picked } from "./types";
import { exportName, exportUrl, isNative } from "./native";
import * as onepick from "./onepick";
import { CloudError, loadScript, xhrUpload } from "./types";

type TokenResponse = { access_token?: string; expires_in?: number | string; error?: string };
type Gis = {
  accounts: {
    oauth2: {
      initTokenClient: (o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string }) => void }) => {
        requestAccessToken: (o?: { prompt?: string }) => void;
      };
    };
  };
};

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILES = "https://www.googleapis.com/drive/v3/files";

/** Google's OAuth page that ends in its own Drive picker (the window adds `state`). */
export function onepickUrl(clientId: string, origin: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("response_type", "token");
  u.searchParams.set("scope", SCOPE);
  u.searchParams.set("redirect_uri", `${origin}/cloud/google`);
  // Google asks which files the app may open: that consent is the picker itself.
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("trigger_onepick", "true");
  return u.toString();
}

type Meta = { id: string; name?: string; mimeType?: string; size?: string };

/** The picked IDs as rows: name, type and size come from files.get (drive.file covers picked files). */
export async function pickedFiles(token: string, ids: string[], get: typeof fetch = fetch): Promise<Picked[]> {
  const auth = { Authorization: `Bearer ${token}` };
  const metas = await Promise.all(
    ids.map(async (id): Promise<Meta | null> => {
      try {
        const r = await get(`${FILES}/${encodeURIComponent(id)}?fields=id,name,mimeType,size`, { headers: auth });
        return r.ok ? ((await r.json()) as Meta) : null;
      } catch {
        return null;
      }
    }),
  );
  return ids.map((id, i): Picked => {
    const d = metas[i];
    const fid = `f${i + 1}`;
    if (!d) return { id: fid, name: "Google Drive file", size: 0, request: async () => Promise.reject(new CloudError("denied")) };
    const name = d.name || "Google Drive file";
    if (isNative(d.mimeType))
      return {
        id: fid,
        name: exportName(name),
        size: 0, // unknown until exported
        native: true,
        request: async () => ({ url: exportUrl(id), headers: auth, name: exportName(name), type: "application/pdf" }),
      };
    return {
      id: fid,
      name,
      size: Number(d.size) || 0,
      request: async () => ({ url: `${FILES}/${encodeURIComponent(id)}?alt=media`, headers: auth, name, type: d.mimeType, total: Number(d.size) || undefined }),
    };
  });
}

export function createAdapter(ctx: AdapterCtx): Adapter {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const g = () => (window as Window & { google?: Gis }).google;
  // Save's token (memory only, spec AC-129) and when it runs out (a minute early).
  let token: string | null = null;
  let expires = 0;
  let pending: { resolve: (t: string) => void; reject: (e: unknown) => void } | null = null;
  let client: ReturnType<Gis["accounts"]["oauth2"]["initTokenClient"]> | null = null;
  // Back from Google's picker: the response is waiting, so the window goes straight on.
  const back = onepick.hasPending();

  const getToken = (): Promise<string> =>
    new Promise((resolve, reject) => {
      if (token && Date.now() < expires) return resolve(token);
      token = null;
      if (!client) return reject(new CloudError("unreachable"));
      pending = { resolve, reject };
      ctx.setPhase("signing");
      client.requestAccessToken({ prompt: "" }); // synchronously inside the tap
    });

  return {
    needsTap: !back,
    prepare: async () => {
      if (ctx.params.mode !== "save") return; // picking needs no Google script
      await loadScript("https://accounts.google.com/gsi/client");
      if (!g()) throw new CloudError("unreachable");
      client = g()!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          const p = pending;
          pending = null;
          if (r.error || !r.access_token) p?.reject(new CloudError("denied"));
          else {
            token = r.access_token;
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
      const r = onepick.take();
      if (!r) {
        ctx.leaving();
        return onepick.start(onepickUrl(clientId, window.location.origin), "google");
      }
      if (r.kind === "empty") return "cancel";
      if (r.kind === "denied") throw new CloudError("denied");
      // A state that isn't ours (or a broken response): its token is never used.
      if (r.kind !== "picked") throw new CloudError("unreachable");
      ctx.setPhase("connecting");
      return pickedFiles(r.token, r.ids);
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
