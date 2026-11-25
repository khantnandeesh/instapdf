/**
 * lib/motion before the engine arrives (docs/design/motion.md §2, wrapper rule 1): every call completes
 * at once, so no interaction waits on the network. The engine itself runs in the browser (e2e/ui/motion.spec.ts).
 */
import { describe, expect, it, vi } from "vitest";
import { exit, motionReady, settle } from "./index";
import { enter, flip, swap } from "./flow";

/** Just enough of an element for the fallbacks (they must not need a DOM). */
function fakeEl() {
  const attrs = new Map<string, string>([["aria-hidden", "true"]]);
  return {
    style: { opacity: "0", transform: "translateY(4px)" },
    inert: true,
    removeAttribute: (n: string) => attrs.delete(n),
    getAttribute: (n: string) => attrs.get(n) ?? null,
  } as unknown as HTMLElement;
}

describe("lib/motion without the engine", () => {
  it("is not ready", () => expect(motionReady()).toBe(false));

  it("exit resolves at once and leaves the element alone", async () => {
    const el = fakeEl();
    await expect(exit(el, "dialog")).resolves.toBeUndefined();
    await expect(exit(null, "toast")).resolves.toBeUndefined();
    expect(el.style.opacity).toBe("0");
  });

  it("flip applies the change once, with no animation", () => {
    const mutate = vi.fn();
    flip(fakeEl(), mutate, "filter");
    flip(null, mutate);
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("enter and swap do nothing (the CSS entrance or the final state is already on screen)", () => {
    const el = fakeEl();
    expect(() => enter(el, "list")).not.toThrow();
    expect(() => swap(el, fakeEl(), "tick")).not.toThrow();
    expect(el.style.transform).toBe("translateY(4px)");
  });

  it("settle leaves the element alone (no exit ran, so its own inert and aria-hidden stay)", () => {
    const el = fakeEl();
    settle(el);
    expect(el.style.opacity).toBe("0");
    expect(el.inert).toBe(true);
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(() => settle(null)).not.toThrow();
  });
});
