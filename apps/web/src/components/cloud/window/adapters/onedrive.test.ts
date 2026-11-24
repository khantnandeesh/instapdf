import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterCtx } from "./types";
import { CloudError } from "./types";

// MSAL stubbed: what matters is how the window drives the full-page sign-in.
const pca = {
  handleRedirectPromise: vi.fn(),
  setActiveAccount: vi.fn(),
  getActiveAccount: vi.fn(() => null),
  getAllAccounts: vi.fn(() => []),
  loginRedirect: vi.fn(() => Promise.resolve()),
  acquireTokenSilent: vi.fn(),
  acquireTokenRedirect: vi.fn(() => Promise.resolve()),
};
const createStandardPublicClientApplication = vi.fn(async (config: unknown) => (void config, pca));
vi.mock("@azure/msal-browser", () => ({ createStandardPublicClientApplication }));

const { completeRedirect, createAdapter } = await import("./onedrive");

const ctx = (): AdapterCtx => ({
  params: { req: "6f1c2a8e-3b4d-4e5f-8a9b-000000000001", accept: [".pdf"], multiple: true, max: 1, tool: "Merge PDF", provider: "onedrive" },
  setPhase: vi.fn(),
  frame: vi.fn(async () => null),
  leaving: vi.fn(),
});

beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "https://berrypdf.test" } });
  for (const f of Object.values(pca)) f.mockClear();
  pca.handleRedirectPromise.mockResolvedValue(null);
  createStandardPublicClientApplication.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OneDrive sign-in round trip", () => {
  it("back on the bare redirect URL: MSAL handles the response and returns to the window's own URL", async () => {
    vi.useFakeTimers();
    const done = completeRedirect();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toBe(false);
    expect(pca.handleRedirectPromise).toHaveBeenCalledWith({ navigateToLoginRequestUrl: true });
    const config = createStandardPublicClientApplication.mock.calls[0][0] as { auth: { redirectUri: string }; cache: { cacheLocation: string } };
    expect(config.auth.redirectUri).toBe("https://berrypdf.test/cloud/onedrive");
    // Tokens in memory only.
    expect(config.cache.cacheLocation).toBe("memoryStorage");
  });

  it("back on the window's own URL: prepare() finishes the sign-in with the same call and keeps the account", async () => {
    const account = { homeAccountId: "a" };
    pca.handleRedirectPromise.mockResolvedValue({ account });
    const c = ctx();
    await createAdapter(c).prepare();
    expect(c.setPhase).toHaveBeenCalledWith("connecting");
    expect(pca.handleRedirectPromise).toHaveBeenCalledWith({ navigateToLoginRequestUrl: true });
    expect(pca.setActiveAccount).toHaveBeenCalledWith(account);
  });

  it("a refused consent is 'denied'; anything else is 'unreachable'", async () => {
    pca.handleRedirectPromise.mockRejectedValueOnce({ errorCode: "access_denied" });
    await expect(createAdapter(ctx()).prepare()).rejects.toEqual(new CloudError("denied"));
    pca.handleRedirectPromise.mockRejectedValueOnce({ errorCode: "network_error" });
    await expect(createAdapter(ctx()).prepare()).rejects.toEqual(new CloudError("unreachable"));
  });

  it("first pick: one sign-in that consents to the picker and Graph at once, with no account chooser", async () => {
    const c = ctx();
    const a = createAdapter(c);
    await a.prepare();
    void a.pick();
    await vi.waitFor(() => expect(pca.loginRedirect).toHaveBeenCalledTimes(1));
    expect(c.leaving).toHaveBeenCalledTimes(1);
    expect(pca.loginRedirect).toHaveBeenCalledWith({ scopes: ["OneDrive.ReadOnly"], extraScopesToConsent: ["Files.Read"] });
    expect(JSON.stringify(pca.loginRedirect.mock.calls)).not.toContain("select_account");
  });
});
