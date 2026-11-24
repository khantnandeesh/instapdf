import { describe, expect, it } from "vitest";
import { cloudRoutes, cloudSourcesOn, configuredProviders, mockActive, providerList, routeFor } from "./providers";

const keys = { dropboxAppKey: "dbx", googleClientId: "gid", googleApiKey: "gkey", googleAppId: "123", onedriveClientId: "ms" };

describe("cloud providers (flag and keys)", () => {
  it("flag off: nothing, whatever keys are set (AC-120)", () => {
    expect(configuredProviders({ ...keys, production: true })).toEqual([]);
    expect(cloudRoutes({ ...keys, production: true, mock: "1" })).toEqual([]);
    expect(mockActive({ mock: "1" })).toBe(false);
  });
  it("live: only providers whose public IDs are set, in the fixed order (AC-124)", () => {
    expect(configuredProviders({ flag: "1", production: true, onedriveClientId: "ms" })).toEqual(["onedrive"]);
    expect(configuredProviders({ flag: "1", production: true, ...keys })).toEqual(["google", "dropbox", "onedrive"]);
    // Google needs all three of its values.
    expect(configuredProviders({ flag: "1", production: true, googleClientId: "gid", googleApiKey: " " })).toEqual([]);
    expect(cloudRoutes({ flag: "1", production: true, dropboxAppKey: "dbx" })).toEqual(["dropbox"]);
  });
  it("mock: every provider through /cloud/mock; never in a production build without NEXT_PUBLIC_CLOUD_MOCK=1", () => {
    expect(mockActive({ flag: "1", production: true })).toBe(false);
    expect(mockActive({ flag: "1", production: true, mock: "1" })).toBe(true);
    expect(mockActive({ flag: "1", production: false })).toBe(true);
    expect(mockActive({ flag: "1", production: false, mock: "0" })).toBe(false);
    const env = { flag: "1", production: true, mock: "1" };
    expect(configuredProviders(env)).toEqual(["google", "dropbox", "onedrive"]);
    expect(cloudRoutes(env)).toEqual(["mock"]);
    expect(routeFor("dropbox", env)).toBe("mock");
    expect(routeFor("dropbox", { flag: "1", production: true, ...keys })).toBe("dropbox");
  });
  it("the build's flag (next.config.ts): on only with a provider to show, so the flag without keys builds as off (M-a)", () => {
    expect(cloudSourcesOn({ flag: "1", production: true })).toBe(false);
    expect(cloudSourcesOn({ flag: "1", production: true, googleClientId: "gid", googleApiKey: "gkey" })).toBe(false);
    expect(cloudSourcesOn({ flag: "1", production: true, dropboxAppKey: "dbx" })).toBe(true);
    expect(cloudSourcesOn({ flag: "1", production: true, mock: "1" })).toBe(true);
    expect(cloudSourcesOn({ flag: "1", production: false })).toBe(true); // next dev: the mock
    expect(cloudSourcesOn({ production: true, ...keys })).toBe(false);
  });
  it("names the configured list", () => {
    expect(providerList(["google", "dropbox", "onedrive"])).toBe("Google Drive, Dropbox or OneDrive");
    expect(providerList(["dropbox"])).toBe("Dropbox");
    expect(providerList(["google", "onedrive"])).toBe("Google Drive or OneDrive");
  });
});
