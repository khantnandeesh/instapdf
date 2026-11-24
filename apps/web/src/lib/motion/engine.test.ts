// @vitest-environment happy-dom
/**
 * The engine keeps a reference only to animations that are running (code review M1): a finished or
 * interrupted tween must not keep its targets (detached DOM, Flip states of removed tiles) alive for the
 * session. GSAP runs on happy-dom's requestAnimationFrame here; nothing is painted.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type * as Engine from "./engine";

let m: typeof Engine;

beforeAll(async () => {
  // happy-dom has no Web Animations API; the engine only asks it for running CSS animations.
  Element.prototype.getAnimations ??= () => [];
  m = await import("./engine");
});

/** Waits until nothing is running (every preset ends within the 400ms cap). */
async function drained(ms = 1500) {
  const until = performance.now() + ms;
  while (m.liveCount() > 0 && performance.now() < until) await new Promise((r) => setTimeout(r, 20));
  return m.liveCount();
}

function els(n: number) {
  return Array.from({ length: n }, () => {
    const el = document.createElement("div");
    el.setAttribute("data-flip", "");
    document.body.append(el);
    return el;
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("lib/motion engine: retained animations", () => {
  it("counts running tweens and lets go of every one once they complete", async () => {
    const [a, b, c, d, e] = els(5);
    m.enter([a, b], "list");
    m.enter(c, "dialog");
    m.swap(d, e, "tick");
    const gone = m.exit(a, "card");
    expect(m.liveCount()).toBeGreaterThan(0);
    await gone;
    expect(await drained()).toBe(0);
  });

  it("drops an exit that is interrupted (killed or overwritten) and still resolves it", async () => {
    const [a, b] = els(2);
    const killed = m.exit(a, "dialog");
    m.kill(a);
    await expect(killed).resolves.toBeUndefined();
    const overwritten = m.exit(b, "dialog");
    m.enter(b, "dialog"); // a new call on the element retargets it (overwrite: "auto")
    await expect(overwritten).resolves.toBeUndefined();
    expect(await drained()).toBe(0);
  });

  it("drops a FLIP timeline when it completes and when a new change completes it early", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const items = Array.from({ length: 3 }, () => {
      const el = document.createElement("div");
      el.setAttribute("data-flip", "");
      // A size, so the in-view filter keeps them (happy-dom does no layout).
      el.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 50, height: 50 });
      root.append(el);
      return el;
    });
    m.flip(root, () => root.append(items[0]), "reorder");
    m.flip(root, () => root.append(items[1]), "reorder");
    expect(await drained()).toBe(0);
  });

  it("does not register zero-length tweens", () => {
    const before = m.liveCount();
    m.enter([], "list");
    expect(m.liveCount()).toBe(before);
  });
});
