import { describe, expect, it } from "vitest";
import { CLOUD_LAST_KEY, cloudPrepaintScript, parseLast } from "./last-used";

describe("last used source", () => {
  it("keeps only a configured provider word", () => {
    expect(parseLast("dropbox", ["google", "dropbox"])).toBe("dropbox");
    expect(parseLast("onedrive", ["google", "dropbox"])).toBeNull(); // no longer configured
    expect(parseLast("device", ["google"])).toBeNull();
    expect(parseLast('{"p":"google"}', ["google"])).toBeNull();
    expect(parseLast(null, ["google"])).toBeNull();
  });

  it("the pre-paint script marks <html> for a configured provider only, and never throws", () => {
    const run = (stored: string | null, configured: ("google" | "dropbox" | "onedrive")[], throws = false) => {
      const attrs: Record<string, string> = {};
      const localStorage = {
        getItem: (k: string) => {
          if (throws) throw new Error("blocked");
          return k === CLOUD_LAST_KEY ? stored : null;
        },
      };
      const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
      new Function("localStorage", "document", cloudPrepaintScript(configured))(localStorage, document);
      return attrs["data-cloud-last"];
    };
    expect(run("dropbox", ["google", "dropbox"])).toBe("dropbox");
    expect(run("onedrive", ["google", "dropbox"])).toBeUndefined();
    expect(run("device", ["google"])).toBeUndefined();
    expect(run("google", ["google"], true)).toBeUndefined();
  });
});
