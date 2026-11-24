/**
 * Dropbox Chooser in the /cloud/dropbox window (research §3.1). `dropins.js` is loaded from
 * Dropbox only here; `Dropbox.choose` opens Dropbox's own popup from the tap and returns
 * temporary direct links, which this window fetches straight away (they expire after ~4 h).
 * No token at all. [U] needs a real app key to run end to end.
 */
import type { Adapter, AdapterCtx } from "./types";
import { CloudError, loadScript } from "./types";

type ChooserFile = { name: string; link: string; bytes: number; id?: string };
type DropboxApi = {
  choose: (o: {
    success: (files: ChooserFile[]) => void;
    cancel: () => void;
    linkType: "direct";
    multiselect: boolean;
    extensions: string[];
    folderselect: boolean;
    sizeLimit?: number;
  }) => void;
};

export function createAdapter(ctx: AdapterCtx): Adapter {
  const key = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY ?? "";
  const api = () => (window as Window & { Dropbox?: DropboxApi }).Dropbox;
  return {
    needsTap: true,
    prepare: async () => {
      await loadScript("https://www.dropbox.com/static/api/2/dropins.js", { id: "dropboxjs", "data-app-key": key });
      if (!api()) throw new CloudError("unreachable");
    },
    pick: () =>
      new Promise((resolve, reject) => {
        const dbx = api();
        if (!dbx) return reject(new CloudError("unreachable"));
        ctx.setPhase("picking");
        // Synchronously inside the tap: the Chooser's popup needs the user gesture.
        dbx.choose({
          linkType: "direct",
          multiselect: ctx.params.multiple,
          extensions: ctx.params.accept,
          folderselect: false,
          sizeLimit: ctx.params.max,
          success: (files) =>
            resolve(
              files.map((f, i) => ({
                id: `f${i + 1}`,
                name: f.name,
                size: f.bytes,
                request: async () => ({ url: f.link, name: f.name, total: f.bytes }),
              })),
            ),
          cancel: () => resolve("cancel"),
        });
      }),
  };
}
