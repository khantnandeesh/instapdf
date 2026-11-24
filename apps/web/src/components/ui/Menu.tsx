"use client";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { ArrowLeftIcon, ChevronRightIcon } from "./icons";

export type MenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Shown at the end of the row (e.g. "opens a window", or the submenu chevron). */
  trailing?: ReactNode;
  /** Screen-reader-only text after the label (", opens a new window"). */
  srHint?: string;
  disabled?: boolean;
  onSelect: () => void;
  /** An in-place submenu: choosing the item swaps the list, with "Back" first (F23 U-4). */
  submenu?: MenuEntry[];
};

export type MenuEntry = MenuItem | { separator: true } | { note: string } | { group: string; items: MenuEntry[] };

const isItem = (e: MenuEntry): e is MenuItem => "id" in e;

export type MenuButtonHandle = { focus: () => void; open: () => void; element: HTMLButtonElement | null };

/**
 * WAI-ARIA menu button (spec F3 M-4 `Menu`). The popup uses the native
 * `popover="auto"` attribute: top layer, light dismiss, no z-index fights.
 * It opens below the trigger, or above it when there is not enough room.
 * Arrow keys, Home/End and first-letter type-ahead move between items;
 * Escape closes and returns focus to the trigger; Tab closes and moves on.
 */
export const MenuButton = forwardRef<
  MenuButtonHandle,
  {
    /** Accessible name of the trigger. */
    label: string;
    /** What the trigger shows (defaults to the label). */
    children?: ReactNode;
    items: MenuEntry[];
    className?: string;
    placement?: "bottom-start" | "bottom-end";
    tabIndex?: number;
    disabled?: boolean;
    title?: string;
    onOpenChange?: (open: boolean) => void;
    onFocus?: () => void;
    onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
    "data-testid"?: string;
    /** A line outside the `role="menu"` list, inside the same popover, that describes it (F23 U-4). */
    footnote?: ReactNode;
    /** "auto": below 640 px the menu is a sheet above the bottom dock (F23 U-3); positioned by CSS. */
    presentation?: "popover" | "auto";
    /** Extra class for the popover (e.g. a wider menu). */
    popupClassName?: string;
  }
>(function MenuButton(
  { label, children, items: rootItems, className, placement = "bottom-start", tabIndex, disabled, title, onOpenChange, onFocus, onKeyDown, footnote, presentation = "popover", popupClassName, ...rest },
  ref,
) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const footId = useId();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const focusFirst = useRef<"first" | "last">("first");
  // The open submenu (its parent item's id), shown in place of the list.
  const [sub, setSub] = useState<string | null>(null);
  const subParent = sub ? findItem(rootItems, sub) : undefined;
  const items: MenuEntry[] = subParent?.submenu
    ? [{ id: "__back", label: "Back", icon: <BackIcon />, onSelect: () => {} }, ...subParent.submenu]
    : rootItems;
  const refocus = useRef<string | null>(null);

  const itemEls = () => Array.from(popup.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []);

  const position = useCallback(() => {
    const t = trigger.current?.getBoundingClientRect();
    const p = popup.current;
    if (!t || !p) return;
    if (p.classList.contains("ip-menu-sheet")) {
      // The sheet is placed by CSS (above the dock); nothing to measure.
      p.style.top = "";
      p.style.left = "";
      return;
    }
    const h = p.offsetHeight;
    const w = p.offsetWidth;
    const below = window.innerHeight - t.bottom;
    const top = below < h + 8 && t.top > below ? Math.max(8, t.top - h - 4) : Math.min(window.innerHeight - h - 8, t.bottom + 4);
    let left = placement === "bottom-end" ? t.right - w : t.left;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    p.style.top = `${Math.max(8, top)}px`;
    p.style.left = `${left}px`;
  }, [placement]);

  const show = useCallback(
    (where: "first" | "last" = "first") => {
      const p = popup.current;
      if (!p || disabled) return;
      focusFirst.current = where;
      const asSheet = presentation === "auto" && window.matchMedia("(max-width: 639px)").matches;
      p.classList.toggle("ip-menu-sheet", asSheet);
      setSheet(asSheet);
      setSub(null);
      try {
        p.showPopover();
      } catch {
        return;
      }
      // The toggle event is async: position and move focus now, so a fast next key reaches the menu.
      setOpen(true);
      position();
      const list = itemEls();
      (where === "last" ? list[list.length - 1] : list[0])?.focus();
    },
    [disabled, position, presentation],
  );
  const hide = useCallback((returnFocus: boolean) => {
    try {
      popup.current?.hidePopover();
    } catch {}
    if (returnFocus) trigger.current?.focus();
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => trigger.current?.focus(),
    open: () => show("first"),
    get element() {
      return trigger.current;
    },
  }));

  useEffect(() => {
    const p = popup.current;
    if (!p) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      onOpenChange?.(isOpen);
      if (isOpen) position();
      else setSub(null);
    };
    p.addEventListener("toggle", onToggle);
    const reposition = () => {
      if (p.matches(":popover-open")) position();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      p.removeEventListener("toggle", onToggle);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [onOpenChange, position]);

  // After a submenu swap, focus the first item (entering) or the parent item (leaving).
  useEffect(() => {
    const want = refocus.current;
    if (want === null) return;
    refocus.current = null;
    const list = itemEls();
    (want === "" ? list.find((el) => el.dataset.id !== "__back") : list.find((el) => el.dataset.id === want))?.focus();
  }, [sub]);
  const enterSub = (id: string) => {
    refocus.current = "";
    setSub(id);
  };
  const leaveSub = () => {
    refocus.current = sub;
    setSub(null);
  };

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const list = itemEls();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    const current = list[at];
    switch (e.key) {
      case "ArrowRight": {
        const it = current?.dataset.id ? findItem(items, current.dataset.id) : undefined;
        if (!it?.submenu) return;
        enterSub(it.id);
        break;
      }
      case "ArrowLeft":
        if (!sub) return;
        leaveSub();
        break;
      case "ArrowDown":
        go(at + 1);
        break;
      case "ArrowUp":
        go(at - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(list.length - 1);
        break;
      case "Escape":
        if (sub) leaveSub();
        else hide(true);
        break;
      case "Tab":
        hide(false);
        trigger.current?.focus();
        return; // let Tab move on from the trigger
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const k = e.key.toLowerCase();
          const start = at + 1;
          const hit = [...list.slice(start), ...list.slice(0, start)].find((el) => el.textContent?.trim().toLowerCase().startsWith(k));
          hit?.focus();
          break;
        }
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        tabIndex={tabIndex}
        disabled={disabled}
        title={title}
        className={className}
        onFocus={onFocus}
        onClick={() => (open ? hide(false) : show("first"))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            show(e.key === "ArrowUp" ? "last" : "first");
            return;
          }
          onKeyDown?.(e);
        }}
        data-testid={rest["data-testid"]}
      >
        {children ?? label}
      </button>
      <div
        ref={popup}
        popover="auto"
        onKeyDown={onMenuKey}
        // BerryPDF Menu: white, 1.5px sand, radius 14, shadow-menu, scales in (0.15s). Placed by
        // position() through the CSSOM (never a style attribute in server HTML: strict CSP).
        className={cx("mp-menu fixed inset-auto m-0 max-w-[calc(100vw-32px)] min-w-[220px] p-1.5 text-ink", popupClassName)}
      >
        <div id={menuId} role="menu" aria-label={subParent ? subParent.label : label} aria-describedby={footnote ? footId : undefined}>
          {renderEntries(items, sheet, (entry) => {
            if (entry.id === "__back") return leaveSub();
            if (entry.submenu) return enterSub(entry.id);
            hide(true);
            entry.onSelect();
          })}
        </div>
        {footnote && (
          <p id={footId} className="ip-menu-foot">
            {footnote}
          </p>
        )}
      </div>
    </>
  );
});

function findItem(entries: MenuEntry[], id: string): MenuItem | undefined {
  for (const e of entries) {
    if (isItem(e)) {
      if (e.id === id) return e;
      const inSub = e.submenu ? findItem(e.submenu, id) : undefined;
      if (inSub) return inSub;
    } else if ("group" in e) {
      const hit = findItem(e.items, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

function renderEntries(entries: MenuEntry[], sheet: boolean, choose: (item: MenuItem) => void): ReactNode {
  return entries.map((entry, i) =>
    isItem(entry) ? (
      <button
        key={entry.id}
        type="button"
        role="menuitem"
        tabIndex={-1}
        data-id={entry.id}
        aria-haspopup={entry.submenu ? "menu" : undefined}
        disabled={entry.disabled}
        className={cx(
          "flex h-11 w-full items-center gap-2 rounded-[9px] px-3 text-start text-[15px] whitespace-nowrap outline-none [@media(pointer:fine)]:lg:h-10",
          sheet && "h-12 text-[16px] [@media(pointer:fine)]:lg:h-12",
          "transition-colors duration-(--dur-base) hover:bg-band hover:text-brand-strong focus:bg-band focus:text-brand-strong disabled:text-muted disabled:opacity-60",
        )}
        onClick={() => choose(entry)}
      >
        {entry.icon && <span className="shrink-0 text-muted">{entry.icon}</span>}
        {entry.label}
        {entry.srHint && <span className="sr-only">{entry.srHint}</span>}
        {(entry.trailing || entry.submenu) && <span className="ms-auto ps-4 text-muted">{entry.trailing ?? <ChevronRightIcon size={14} />}</span>}
      </button>
    ) : "separator" in entry ? (
      <div key={`s${i}`} role="separator" className="mx-2 my-1 h-[1.5px] bg-sand" />
    ) : "group" in entry ? (
      <div key={`g${i}`} role="group" aria-label={entry.group}>
        <div aria-hidden="true" className="px-3 pt-2 pb-1 font-display text-[13px] leading-[18px] font-semibold text-muted">
          {entry.group}
        </div>
        {renderEntries(entry.items, sheet, choose)}
      </div>
    ) : (
      <p key={`n${i}`} className="px-3 py-2 text-help text-muted">
        {entry.note}
      </p>
    ),
  );
}

function BackIcon() {
  return <ArrowLeftIcon size={16} />;
}
