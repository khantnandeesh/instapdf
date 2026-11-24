/**
 * Focus moves the page makes on its own (after a file pick, after a dialog):
 * they follow the visitor's last input, like `:focus-visible` does for real
 * clicks. After a mouse or touch action the moved focus shows no ring
 * (`data-quiet-focus`, styled in tool-flow.css); the next key press on that
 * element brings the ring back, so keyboard users always see where they are.
 */

export type InputModality = "pointer" | "keyboard";

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/**
 * Calls `onChange` with "pointer" on every pointerdown and "keyboard" on every
 * keydown (capture phase, so nothing can stop it). Returns the cleanup.
 */
export function trackInputModality(onChange: (m: InputModality) => void, target: Listenable = document): () => void {
  const pointer = () => onChange("pointer");
  const keyboard = (e: Event) => {
    // A modifier on its own (Shift held while clicking, say) doesn't make this a keyboard session.
    const key = (e as KeyboardEvent).key;
    if (key === "Control" || key === "Meta" || key === "Alt" || key === "Shift") return;
    onChange("keyboard");
  };
  target.addEventListener("pointerdown", pointer, { capture: true });
  // Dropping files from the desktop fires no pointerdown in the page, but it is a pointer action.
  target.addEventListener("drop", pointer, { capture: true });
  target.addEventListener("keydown", keyboard, { capture: true });
  return () => {
    target.removeEventListener("pointerdown", pointer, { capture: true });
    target.removeEventListener("drop", pointer, { capture: true });
    target.removeEventListener("keydown", keyboard, { capture: true });
  };
}

type Focusable = Listenable & Pick<HTMLElement, "focus" | "setAttribute" | "removeAttribute">;

export const QUIET_FOCUS_ATTR = "data-quiet-focus";

/**
 * Moves focus to `el`. After a pointer action the element is marked quiet
 * (no visible ring) until it gets a key press or loses focus.
 */
export function moveFocus(el: Focusable, modality: InputModality): void {
  if (modality === "pointer") {
    el.setAttribute(QUIET_FOCUS_ATTR, "");
    const clear = () => {
      el.removeAttribute(QUIET_FOCUS_ATTR);
      el.removeEventListener("keydown", clear);
      el.removeEventListener("blur", clear);
    };
    el.addEventListener("keydown", clear);
    el.addEventListener("blur", clear);
    // `focusVisible: false` where the browser supports it; the attribute covers the rest.
    el.focus({ focusVisible: false } as FocusOptions);
  } else {
    el.focus();
  }
}

/** True when `el` is in the document and rendered (not `display: none` or in a hidden subtree). */
export function isShown(el: (Pick<Element, "getClientRects"> & { isConnected: boolean }) | null | undefined): el is HTMLElement {
  return !!el && el.isConnected && el.getClientRects().length > 0;
}
