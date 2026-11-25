// @vitest-environment happy-dom
/**
 * usePresence (lib/motion/react.ts): keeps a part rendered while it leaves, hides it once every part's exit
 * has resolved, and on a reopen mid-exit settles the parts and keeps them. A stand-in engine makes each exit
 * a promise the test resolves; the real engine runs in e2e/ui/motion.spec.ts (8 and 9).
 */
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Engine from "./engine";
import type { Preset } from "./presets";
import { usePresence } from "./react";
import { setMotion } from "./state";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Exit = { el: HTMLElement; preset: Preset; done: () => void };
let exits: Exit[];
let settled: HTMLElement[];

/** Installs (or, with `null`, removes) the stand-in engine. */
function engine(on: boolean) {
  setMotion(
    (on
      ? {
          exit: (el: HTMLElement, preset: Preset) => new Promise<void>((done) => exits.push({ el, preset, done })),
          settle: (el: HTMLElement) => void settled.push(el),
        }
      : undefined) as unknown as typeof Engine,
  );
}

/** Renders a panel and its scrim behind usePresence and records what the hook returned on each render. */
function Host({ open, log }: { open: boolean; log: boolean[] }) {
  const panel = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const shown = usePresence(open, [
    [panel, "panel"],
    [scrim, "overlay"],
  ]);
  log.push(shown);
  return shown ? createElement("div", null, createElement("div", { ref: panel, id: "panel" }), createElement("div", { ref: scrim, id: "scrim" })) : null;
}

let root: Root;
let host: HTMLElement;
const log: boolean[] = [];
const render = (open: boolean) => act(() => root.render(createElement(Host, { open, log })));
const shownNow = () => log[log.length - 1];
const resolveAll = () => act(async () => exits.splice(0).forEach((e) => e.done()));

beforeEach(() => {
  exits = [];
  settled = [];
  log.length = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  engine(false);
});

describe("usePresence", () => {
  it("without the engine, hides at once on close", () => {
    engine(false);
    render(true);
    expect(shownNow()).toBe(true);
    render(false);
    expect(shownNow()).toBe(false);
    expect(host.querySelector("#panel")).toBeNull();
  });

  it("keeps the parts while each runs its exit, then hides them", async () => {
    engine(true);
    render(false);
    expect(shownNow()).toBe(false);
    expect(exits).toHaveLength(0); // nothing to leave when it was never open
    render(true);
    expect(host.querySelector("#panel")).not.toBeNull();
    render(false);
    // Exits start in the close's own commit (a layout effect), for both parts, with their presets.
    expect(exits.map((e) => [e.el.id, e.preset])).toEqual([
      ["panel", "panel"],
      ["scrim", "overlay"],
    ]);
    expect(shownNow()).toBe(true);
    await act(async () => exits.shift()!.done());
    expect(shownNow(), "still shown until every part is gone").toBe(true);
    await resolveAll();
    expect(shownNow()).toBe(false);
    expect(host.querySelector("#panel")).toBeNull();
  });

  it("reopening mid-exit settles the parts and keeps them; the old exit then changes nothing", async () => {
    engine(true);
    render(true);
    const panel = host.querySelector<HTMLElement>("#panel")!;
    render(false);
    expect(exits).toHaveLength(2);
    const stale = exits.splice(0);
    settled.length = 0;
    render(true);
    expect(settled.map((el) => el.id)).toEqual(["panel", "scrim"]);
    expect(host.querySelector("#panel"), "the same element, not a new one").toBe(panel);
    await act(async () => stale.forEach((e) => e.done()));
    expect(shownNow()).toBe(true);
    expect(host.querySelector("#panel")).toBe(panel);
    // And it can still close normally afterwards.
    render(false);
    expect(exits).toHaveLength(2);
    await resolveAll();
    expect(shownNow()).toBe(false);
  });

  it("an exit that resolves after unmount does nothing", async () => {
    engine(true);
    render(true);
    render(false);
    const pending = exits.splice(0);
    act(() => root.render(null));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => pending.forEach((e) => e.done()));
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
