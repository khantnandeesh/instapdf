import { describe, expect, it, vi } from "vitest";
import { classifyDriveCheck, classifyPopupError, classifyTokenError, findPickerResponse, pickerUrl } from "./google";
import { PICKER_QUIET_MS, pickerWatchdog } from "./watchdog";

describe("Google sign-in failures (what the /cloud/google window can detect)", () => {
  it("token client errors: refused access is denied, every other OAuth error is a sign-in to put right", () => {
    expect(classifyTokenError(undefined)).toBe("ok");
    expect(classifyTokenError("access_denied")).toBe("denied");
    for (const e of ["interaction_required", "login_required", "consent_required", "account_selection_required", "invalid_request", "something_new"]) expect(classifyTokenError(e)).toBe("signin");
  });

  it("token client popup errors: closing is a cancel, a window that can't open is unreachable", () => {
    expect(classifyPopupError("popup_closed")).toBe("cancel");
    expect(classifyPopupError("popup_failed_to_open")).toBe("unreachable");
    expect(classifyPopupError("unknown")).toBe("signin");
    expect(classifyPopupError(undefined)).toBe("signin");
  });

  it("Drive's answer to the token check", () => {
    expect(classifyDriveCheck(200, null)).toBe("ok");
    expect(classifyDriveCheck(401, { error: { code: 401, status: "UNAUTHENTICATED" } })).toBe("signin");
    expect(classifyDriveCheck(403, { error: { errors: [{ reason: "insufficientPermissions" }] } })).toBe("denied");
    expect(classifyDriveCheck(403, { error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } })).toBe("denied");
    // Says nothing about the sign-in (an API not enabled, a quota, a server error): the picker goes ahead.
    expect(classifyDriveCheck(403, { error: { errors: [{ reason: "accessNotConfigured" }] } })).toBeNull();
    expect(classifyDriveCheck(429, null)).toBeNull();
    expect(classifyDriveCheck(500, null)).toBeNull();
  });
});

describe("pickerWatchdog (Google's blocked picker posts nothing)", () => {
  it("waits about 6 s after the frame's load", () => expect(PICKER_QUIET_MS).toBe(6000));

  const ORIGIN = "https://docs.google.com";
  const setup = () => {
    const target = new EventTarget();
    const frame = { contentWindow: {} };
    const onQuiet = vi.fn();
    const watch = pickerWatchdog({ target: target as unknown as Window, frame, origin: ORIGIN, ms: PICKER_QUIET_MS, onQuiet });
    const post = (origin = ORIGIN, source: unknown = frame.contentWindow) =>
      target.dispatchEvent(Object.assign(new Event("message"), { origin, source, data: JSON.stringify({ action: "loaded" }) }));
    return { watch, onQuiet, post };
  };

  it("silent for the whole wait after the load: fires once, then stops listening", () => {
    vi.useFakeTimers();
    try {
      const w = setup();
      w.watch.loaded();
      vi.advanceTimersByTime(PICKER_QUIET_MS - 1);
      expect(w.onQuiet).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(w.onQuiet).toHaveBeenCalledOnce();
      // Stopped when it fired: a late message or a second load does nothing more.
      w.post();
      w.watch.loaded();
      vi.advanceTimersByTime(PICKER_QUIET_MS * 2);
      expect(w.onQuiet).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a message before the frame's load (the picker's early \"loaded\") means no countdown at all", () => {
    vi.useFakeTimers();
    try {
      const w = setup();
      w.post();
      w.watch.loaded();
      vi.advanceTimersByTime(PICKER_QUIET_MS * 3);
      expect(w.onQuiet).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a message during the countdown stops it", () => {
    vi.useFakeTimers();
    try {
      const w = setup();
      w.watch.loaded();
      vi.advanceTimersByTime(PICKER_QUIET_MS - 100);
      w.post();
      vi.advanceTimersByTime(10_000);
      expect(w.onQuiet).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("messages from another origin or another frame don't count", () => {
    vi.useFakeTimers();
    try {
      const w = setup();
      w.post("https://evil.example");
      w.post(ORIGIN, {});
      w.watch.loaded();
      vi.advanceTimersByTime(PICKER_QUIET_MS);
      expect(w.onQuiet).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("nothing counts down before the load, and stop() cancels it", () => {
    vi.useFakeTimers();
    try {
      const w = setup();
      vi.advanceTimersByTime(PICKER_QUIET_MS * 3);
      expect(w.onQuiet).not.toHaveBeenCalled();
      w.watch.loaded();
      w.watch.stop();
      vi.advanceTimersByTime(PICKER_QUIET_MS * 3);
      expect(w.onQuiet).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

const BASE = "https://docs.google.com/picker?protocol=gadgets&origin=https%3A%2F%2Fberrypdf.test&oauth_token=ya29.a(b)&developerKey=K&nav=((%22all%22%2Cnull))";

describe("pickerUrl", () => {
  it("adds the app ID and the token's account", () => {
    const u = new URL(pickerUrl(BASE, { appId: "123456789", authUser: "a.b+c@example.com" }));
    expect(u.searchParams.get("appId")).toBe("123456789");
    expect(u.searchParams.get("authuser")).toBe("a.b+c@example.com");
  });

  it("leaves both out when unknown", () => {
    expect(pickerUrl(BASE, { appId: "", authUser: "" })).toBe(BASE);
    expect(pickerUrl(BASE)).toBe(BASE);
  });

  it("keeps the rest of toUri()'s query byte for byte", () => {
    expect(pickerUrl(BASE, { appId: "1" }).startsWith(`${BASE}&`)).toBe(true);
  });

  it("puts the parameters before a #fragment, which the server never sees", () => {
    const frag = `${BASE}#rpctoken=1`;
    const out = pickerUrl(frag, { appId: "123", authUser: "a@b.c" });
    expect(out.endsWith("#rpctoken=1")).toBe(true);
    const u = new URL(out);
    expect(u.searchParams.get("appId")).toBe("123");
    expect(u.searchParams.get("authuser")).toBe("a@b.c");
  });

  it("does not add authuser twice when setAuthUser already set it", () => {
    const withUser = `${BASE}&authuser=a%40example.com`;
    expect(new URL(pickerUrl(withUser, { authUser: "a@example.com" })).searchParams.getAll("authuser")).toEqual(["a@example.com"]);
  });
});

describe("findPickerResponse", () => {
  it("finds a pick nested in a JSON string", () => {
    const msg = JSON.stringify({ s: "x", f: { a: [{ action: "picked", docs: [{ id: "1", name: "a.pdf" }, { id: 2 }] }] } });
    expect(findPickerResponse(msg)).toEqual({ action: "picked", docs: [{ id: "1", name: "a.pdf" }] });
  });

  it("ignores unrelated messages", () => {
    expect(findPickerResponse({ action: "loaded" })).toBeNull();
    expect(findPickerResponse("not json")).toBeNull();
  });
});
