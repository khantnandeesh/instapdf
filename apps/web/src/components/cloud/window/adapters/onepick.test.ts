import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as onepick from "./onepick";

const STATE = "google.6f1c2a8e-3b4d-4e5f-8a9b-000000000001";
const q = (o: Record<string, string>) => new URLSearchParams(o);

describe("parse", () => {
  it("a pick: token and the picked IDs", () => {
    expect(onepick.parse(q({ state: STATE, access_token: "T", token_type: "Bearer", expires_in: "3599", picked_file_ids: "a1,b-2_c" }), STATE)).toEqual({
      kind: "picked",
      token: "T",
      ids: ["a1", "b-2_c"],
      expiresIn: 3599,
    });
  });
  it("refuses a state that isn't ours, before looking at anything else", () => {
    expect(onepick.parse(q({ state: "google.other", access_token: "T", picked_file_ids: "a1" }), STATE)).toEqual({ kind: "invalid" });
    expect(onepick.parse(q({ access_token: "T", picked_file_ids: "a1" }), STATE)).toEqual({ kind: "invalid" });
  });
  it("denied, other errors, nothing picked, odd IDs", () => {
    expect(onepick.parse(q({ state: STATE, error: "access_denied" }), STATE)).toEqual({ kind: "denied" });
    expect(onepick.parse(q({ state: STATE, error: "server_error" }), STATE)).toEqual({ kind: "failed" });
    expect(onepick.parse(q({ state: STATE, access_token: "T" }), STATE)).toEqual({ kind: "empty" });
    expect(onepick.parse(q({ state: STATE, access_token: "T", picked_file_ids: "../x,<b>" }), STATE)).toEqual({ kind: "empty" });
    expect(onepick.parse(q({ state: STATE, access_token: "T", token_type: "mac", picked_file_ids: "a" }), STATE)).toEqual({ kind: "failed" });
  });
});

describe("isReturn", () => {
  it("any token (so it never stays in the URL), or an error for this route", () => {
    expect(onepick.isReturn(`#access_token=T&state=${STATE}`, "google")).toBe(true);
    expect(onepick.isReturn(`#error=access_denied&state=${STATE}`, "google")).toBe(true);
    // A token with another state, or none, is still taken off the URL (and then refused).
    expect(onepick.isReturn(`#access_token=T&state=${STATE}`, "mock")).toBe(true);
    expect(onepick.isReturn("#access_token=T", "google")).toBe(true);
    // Every error on /cloud/google; on the mock only its own (its OneDrive-style errors go to completeRedirect).
    expect(onepick.isReturn("#error=access_denied", "google")).toBe(true);
    expect(onepick.isReturn("#error=access_denied&state=6f1c2a8e-3b4d-4e5f-8a9b-000000000001", "mock")).toBe(false);
    expect(onepick.isReturn("#error=access_denied&state=mock.x", "mock")).toBe(true);
    // OneDrive-style sign-in responses (state = the request ID) are not onepick returns.
    expect(onepick.isReturn("#code=MOCK&state=6f1c2a8e-3b4d-4e5f-8a9b-000000000001", "mock")).toBe(false);
    expect(onepick.isReturn("", "google")).toBe(false);
  });
});

describe("start and takeReturn (the round trip)", () => {
  let store: Record<string, string>;
  let href: string;
  const replaceState = vi.fn((_s: unknown, _t: string, url: string) => {
    href = new URL(url, href).toString();
  });
  const assign = vi.fn();
  beforeEach(() => {
    store = {};
    href = "https://berrypdf.test/cloud/google?req=r1&tool=Merge+PDF";
    replaceState.mockClear();
    assign.mockClear();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] });
    vi.stubGlobal("history", { replaceState });
    vi.stubGlobal("location", {
      get href() {
        return href;
      },
      get hash() {
        return new URL(href).hash;
      },
      get pathname() {
        return new URL(href).pathname;
      },
      get origin() {
        return new URL(href).origin;
      },
      assign,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("leaves with a fresh state, then comes back to its own URL with the hash gone and the pick kept in memory", () => {
    void onepick.start("https://accounts.google.com/o/oauth2/v2/auth?client_id=c", "google");
    const out = new URL(assign.mock.calls[0]![0] as string);
    const state = out.searchParams.get("state")!;
    expect(state).toMatch(/^google\.[0-9a-f-]{36}$/);
    // sessionStorage holds the nonce and the window's URL, never a token.
    expect(Object.values(store).join()).not.toContain("access_token");
    href = `https://berrypdf.test/cloud/google#access_token=SECRET&token_type=Bearer&picked_file_ids=a1&state=${state}`;
    expect(onepick.takeReturn("google")).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/cloud/google?req=r1&tool=Merge+PDF");
    expect(href).not.toContain("SECRET");
    expect(store).toEqual({});
    expect(onepick.hasPending()).toBe(true);
    expect(onepick.take()).toMatchObject({ kind: "picked", token: "SECRET", ids: ["a1"] });
    expect(onepick.take()).toBeNull(); // once
  });

  it("a response with no round trip behind it: URL cleared, nothing kept", () => {
    href = `https://berrypdf.test/cloud/google#access_token=SECRET&picked_file_ids=a1&state=${STATE}`;
    expect(onepick.takeReturn("google")).toBe(false);
    expect(href).toBe("https://berrypdf.test/cloud/google");
    expect(onepick.take()).toBeNull();
  });

  it("calls leaving just before it goes, never when the nonce can't be kept (storage blocked)", () => {
    const leaving = vi.fn();
    void onepick.start("https://accounts.google.com/x", "google", leaving);
    expect(leaving).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
    leaving.mockClear();
    assign.mockClear();
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem: () => {},
    });
    expect(() => onepick.start("https://accounts.google.com/x", "google", leaving)).toThrow(expect.objectContaining({ code: "unreachable" }));
    expect(leaving).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("a saved URL from another window or route is never restored", () => {
    void onepick.start("https://accounts.google.com/x", "google");
    const state = new URL(assign.mock.calls[0]![0] as string).searchParams.get("state")!;
    store["berrypdf:cloud-onepick"] = JSON.stringify({ nonce: state.split(".")[1], back: "https://evil.test/cloud/google?req=r1" });
    href = `https://berrypdf.test/cloud/google#access_token=SECRET&picked_file_ids=a1&state=${state}`;
    expect(onepick.takeReturn("google")).toBe(false);
    expect(href).toBe("https://berrypdf.test/cloud/google");
  });
});
