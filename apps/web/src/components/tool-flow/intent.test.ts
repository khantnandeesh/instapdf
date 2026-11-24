import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTENT_EVENTS, onIntent } from "./intent";

/** A minimal window: listeners by type, and dispatch. */
function fakeWindow() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: (type: string, fn: () => void) => void (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn),
    removeEventListener: (type: string, fn: () => void) => void listeners.get(type)?.delete(fn),
    dispatch: (type: string) => [...(listeners.get(type) ?? [])].forEach((fn) => fn()),
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

let win: ReturnType<typeof fakeWindow>;
beforeEach(() => {
  vi.useFakeTimers();
  win = fakeWindow();
  vi.stubGlobal("window", win);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("onIntent", () => {
  it.each(INTENT_EVENTS)("runs once on %s and stops listening", (type) => {
    const go = vi.fn();
    onIntent(go);
    expect(win.count()).toBe(INTENT_EVENTS.length);
    win.dispatch(type);
    win.dispatch("keydown");
    vi.advanceTimersByTime(10_000);
    expect(go).toHaveBeenCalledTimes(1);
    expect(win.count()).toBe(0);
  });

  it("runs after the delay without intent, and not before", () => {
    const go = vi.fn();
    onIntent(go, 4000);
    vi.advanceTimersByTime(3999);
    expect(go).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(go).toHaveBeenCalledTimes(1);
    expect(win.count()).toBe(0);
  });

  it("never runs once cancelled", () => {
    const go = vi.fn();
    const stop = onIntent(go);
    stop();
    win.dispatch("pointerdown");
    vi.advanceTimersByTime(10_000);
    expect(go).not.toHaveBeenCalled();
    expect(win.count()).toBe(0);
  });
});
