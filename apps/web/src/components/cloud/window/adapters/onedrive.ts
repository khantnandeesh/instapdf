/**
 * OneDrive (personal accounts first) in the /cloud/onedrive window (research §3.1): bundled MSAL
 * (@azure/msal-browser, MIT) signs in with a full-page redirect (no popup, no third-party script),
 * then the File Picker v8 runs in our iframe, started with a form POST. Files download through
 * Graph's pre-authenticated downloadUrl (no token sent). Tokens: MSAL memory cache only.
 * Save: Graph simple upload into /BerryPDF with conflictBehavior=rename (never overwrites).
 * [U] needs a real Entra app registration to run end to end.
 */
import type { IPublicClientApplication } from "@azure/msal-browser";
import type { Adapter, AdapterCtx, Picked } from "./types";
import { CloudError } from "./types";

const AUTHORITY = "https://login.microsoftonline.com/consumers";
const PICKER = "https://onedrive.live.com/picker";
const READ = ["Files.Read"];
const WRITE = ["Files.ReadWrite"];
const PICKER_SCOPES = ["OneDrive.ReadOnly"];

type PickedItem = { id: string; name?: string; size?: number; parentReference?: { driveId?: string } };

async function createPca(): Promise<IPublicClientApplication> {
  const msal = await import("@azure/msal-browser");
  return msal.createStandardPublicClientApplication({
    auth: { clientId: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID ?? "", authority: AUTHORITY, redirectUri: `${window.location.origin}/cloud/onedrive` },
    // Tokens stay in memory; MSAL keeps only the sign-in round trip's temporary state in sessionStorage.
    cache: { cacheLocation: "memoryStorage" },
  });
}

const denied = (e: unknown) => new CloudError(/access_denied|consent|user_cancelled/.test((e as { errorCode?: string }).errorCode ?? "") ? "denied" : "unreachable");

/**
 * The window came back from Microsoft's sign-in on `/cloud/onedrive` (no request in the URL): MSAL
 * keeps the response and returns to the window's own URL, where `prepare()` finishes the sign-in.
 * False: it stayed here (nothing to return to).
 */
export async function completeRedirect(): Promise<boolean> {
  const pca = await createPca();
  await pca.handleRedirectPromise({ navigateToLoginRequestUrl: true });
  // A return navigation is under way when MSAL found the request URL; give it a moment to unload.
  return new Promise((resolve) => setTimeout(() => resolve(false), 3000));
}

export function createAdapter(ctx: AdapterCtx): Adapter {
  let pca: IPublicClientApplication | null = null;

  /** A token for `scopes`. Signing in consents to `extra` too, so the next token needs no second round trip. */
  const token = async (scopes: string[], extra: string[] = []): Promise<string> => {
    if (!pca) throw new CloudError("unreachable");
    const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0];
    if (!account) {
      ctx.leaving();
      await pca.loginRedirect({ scopes, extraScopesToConsent: extra });
      return new Promise(() => {}); // the page navigates away
    }
    try {
      return (await pca.acquireTokenSilent({ scopes, account })).accessToken;
    } catch {
      ctx.leaving();
      await pca.acquireTokenRedirect({ scopes, account, extraScopesToConsent: extra });
      return new Promise(() => {});
    }
  };

  return {
    needsTap: false,
    prepare: async () => {
      ctx.setPhase("connecting");
      const app = await createPca();
      pca = app;
      try {
        // Back from Microsoft's sign-in (completeRedirect brought us to this URL): finish it, then continue.
        const r = await app.handleRedirectPromise({ navigateToLoginRequestUrl: true });
        if (r?.account) app.setActiveAccount(r.account);
      } catch (e) {
        throw denied(e);
      }
    },
    pick: async () => {
      // Both tokens before the picker shows: a first-time sign-in consents to both at once, and
      // the Graph token never needs a redirect after the pick (which would lose it).
      const pickerToken = await token(PICKER_SCOPES, READ);
      const graph = await token(READ);
      const channelId = crypto.randomUUID();
      const options = {
        sdk: "8.0",
        entry: { oneDrive: {} },
        authentication: {},
        messaging: { origin: window.location.origin, channelId },
        selection: { mode: ctx.params.multiple ? "multiple" : "single" },
        typesAndSources: { mode: "files", filters: ctx.params.accept },
      };
      const qs = new URLSearchParams({ filePicker: JSON.stringify(options), locale: "en-us" });
      ctx.setPhase("picking");
      const frame = await ctx.frame({ post: { action: `${PICKER}/_layouts/15/FilePicker.aspx?${qs}`, fields: { access_token: pickerToken } } }, "OneDrive");
      const items = await new Promise<PickedItem[] | "cancel">((resolve) => {
        const onMessage = (e: MessageEvent) => {
          if (e.source !== frame?.contentWindow) return;
          const m = e.data as { type?: string; channelId?: string };
          if (m?.type !== "initialize" || m.channelId !== channelId || !e.ports[0]) return;
          window.removeEventListener("message", onMessage);
          const port = e.ports[0];
          port.addEventListener("message", async (ev: MessageEvent) => {
            const msg = ev.data as { type?: string; id?: string; data?: { command?: string; items?: PickedItem[]; resource?: string } };
            if (msg.type !== "command" || !msg.id) return;
            port.postMessage({ type: "acknowledge", id: msg.id });
            const cmd = msg.data?.command;
            if (cmd === "authenticate") {
              try {
                const t = await token(PICKER_SCOPES);
                port.postMessage({ type: "result", id: msg.id, data: { result: "token", token: t } });
              } catch {
                port.postMessage({ type: "result", id: msg.id, data: { result: "error", error: { code: "unableToObtainToken" } } });
              }
            } else if (cmd === "pick") {
              port.postMessage({ type: "result", id: msg.id, data: { result: "success" } });
              resolve(msg.data?.items ?? []);
            } else if (cmd === "close") {
              resolve("cancel");
            }
          });
          port.start();
          port.postMessage({ type: "activate" });
        };
        window.addEventListener("message", onMessage);
      });
      void ctx.frame(null);
      if (items === "cancel") return "cancel";
      return items.map(
        (it, i): Picked => ({
          id: `f${i + 1}`,
          name: it.name ?? "file.pdf",
          size: it.size ?? 0,
          request: async () => {
            const drive = it.parentReference?.driveId;
            const meta = await fetch(`https://graph.microsoft.com/v1.0/${drive ? `drives/${encodeURIComponent(drive)}` : "me/drive"}/items/${encodeURIComponent(it.id)}?select=id,name,size,@microsoft.graph.downloadUrl`, {
              headers: { Authorization: `Bearer ${graph}` },
            });
            if (!meta.ok) throw new CloudError(meta.status === 403 || meta.status === 404 ? "denied" : "unreachable");
            const j = (await meta.json()) as { name?: string; size?: number; "@microsoft.graph.downloadUrl"?: string };
            const url = j["@microsoft.graph.downloadUrl"];
            if (!url) throw new CloudError("denied");
            // Pre-authenticated and short-lived: fetched at once, with no Authorization header.
            return { url, name: j.name ?? it.name ?? "file.pdf", total: j.size };
          },
        }),
      );
    },
    save: async (file, onProgress) => {
      const t = await token(WRITE);
      const path = `https://graph.microsoft.com/v1.0/me/drive/root:/BerryPDF/${encodeURIComponent(file.name)}:/content?@microsoft.graph.conflictBehavior=rename`;
      const { xhrUpload } = await import("./types");
      const r = (await xhrUpload("PUT", path, file, { Authorization: `Bearer ${t}`, "Content-Type": file.type || "application/octet-stream" }, onProgress)) as { name?: string; webUrl?: string };
      return { name: r.name ?? file.name, link: r.webUrl };
    },
  };
}
