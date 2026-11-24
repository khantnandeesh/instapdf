import { describe, expect, it } from "vitest";
import { isShown, moveFocus, QUIET_FOCUS_ATTR, trackInputModality, type InputModality } from "./focus";

class FakeEl extends EventTarget {
  attrs = new Map<string, string>();
  focused: FocusOptions | undefined | "none" = "none";
  isConnected = true;
  rects = 1;
  focus(opts?: FocusOptions) {
    this.focused = opts;
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  getClientRects() {
    return { length: this.rects } as DOMRectList;
  }
}

const key = (k: string) => Object.assign(new Event("keydown"), { key: k });

describe("trackInputModality (eval G-7)", () => {
  it("reports pointer and keyboard input, ignoring modifier-only presses", () => {
    const doc = new EventTarget();
    const seen: InputModality[] = [];
    const stop = trackInputModality((m) => seen.push(m), doc);
    doc.dispatchEvent(new Event("pointerdown"));
    doc.dispatchEvent(key("Control"));
    doc.dispatchEvent(key("Tab"));
    expect(seen).toEqual(["pointer", "keyboard"]);
    stop();
    doc.dispatchEvent(new Event("pointerdown"));
    expect(seen).toHaveLength(2);
  });
  it("treats a file drop from the desktop as pointer input (no pointerdown fires)", () => {
    const doc = new EventTarget();
    const seen: InputModality[] = [];
    const stop = trackInputModality((m) => seen.push(m), doc);
    doc.dispatchEvent(new Event("drop"));
    expect(seen).toEqual(["pointer"]);
    stop();
    doc.dispatchEvent(new Event("drop"));
    expect(seen).toHaveLength(1);
  });
});

describe("moveFocus (eval G-7)", () => {
  it("after a pointer action focuses quietly until the next key press", () => {
    const el = new FakeEl();
    moveFocus(el as unknown as HTMLElement, "pointer");
    expect(el.focused).toEqual({ focusVisible: false });
    expect(el.attrs.has(QUIET_FOCUS_ATTR)).toBe(true);
    el.dispatchEvent(key("Tab"));
    expect(el.attrs.has(QUIET_FOCUS_ATTR)).toBe(false);
  });
  it("drops the quiet mark when focus leaves", () => {
    const el = new FakeEl();
    moveFocus(el as unknown as HTMLElement, "pointer");
    el.dispatchEvent(new Event("blur"));
    expect(el.attrs.has(QUIET_FOCUS_ATTR)).toBe(false);
  });
  it("after keyboard input focuses normally (ring shown)", () => {
    const el = new FakeEl();
    moveFocus(el as unknown as HTMLElement, "keyboard");
    expect(el.focused).toBeUndefined();
    expect(el.attrs.has(QUIET_FOCUS_ATTR)).toBe(false);
  });
});

describe("isShown", () => {
  it("is false for missing, detached or undisplayed elements", () => {
    const el = new FakeEl();
    expect(isShown(el)).toBe(true);
    el.rects = 0;
    expect(isShown(el)).toBe(false);
    el.rects = 1;
    el.isConnected = false;
    expect(isShown(el)).toBe(false);
    expect(isShown(null)).toBe(false);
  });
});
