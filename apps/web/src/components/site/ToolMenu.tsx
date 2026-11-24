"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { usePresence } from "@/lib/motion/react";
import { clearRecent } from "@/lib/recent-tools";
import { matchTools } from "@/lib/catalogue/search";
import { catalogueCopy as copy } from "../catalogue/copy";
import { RecentStrip } from "../catalogue/RecentStrip";
import { badgeText, NameSep } from "../catalogue/ToolCard";
import { useToolIndex } from "../catalogue/ToolIndexProvider";
import { CATALOGUE_SEARCH_ID, usable, type ToolIndexItem } from "../catalogue/types";
import { useRecentTools } from "../catalogue/useRecentTools";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { ChevronDownIcon, CloseIcon } from "../ui/icons";
import { IconButton } from "../ui/IconButton";
import { LiveRegion } from "../ui/LiveRegion";
import { RUNTIME_CLIENT_TEXT } from "../ui/RuntimeMarker";
import { SearchField } from "../ui/SearchField";
import { siteCopy } from "./copy";

const DESKTOP = "(min-width: 768px)";
/**
 * The phone menu's full-screen dialog is its own chunk, out of every page's first load (the site
 * header is on all of them). Phones fetch it right after hydration, so it is there before the first
 * tap; a desktop fetches it only if a narrow window opens the menu.
 */
const loadDialog = () => import("../ui/Dialog");
const Dialog = lazy(() => loadDialog().then((m) => ({ default: m.Dialog })));
const MENU_ID = "tool-menu";
const RESULTS_ID = "tool-menu-results";

type Mode = "panel" | "dialog";
/** The panel hangs from the bottom edge of the header bar, full width (owner 2026-11-24). */
function panelTop(trigger: HTMLElement | null): number {
  const header = trigger?.closest("header");
  return Math.max(0, Math.round(header?.getBoundingClientRect().bottom ?? 64));
}

const isTyping = (t: EventTarget | null) =>
  t instanceof Element && (!!t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") || (t as HTMLElement).isContentEditable);

/**
 * "All tools" button plus the tool menu (spec F2 §3d/§3e, H-7).
 * >= 768 px: a disclosure panel under the header (not modal, page not scrolled).
 * <  768 px: a full-screen modal dialog with a focus trap and scroll lock.
 * Also owns the global "/" shortcut (AC-61).
 */
export function ToolMenu() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("panel");
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [focusSearch, setFocusSearch] = useState(true);
  const [query, setQuery] = useState("");
  const [top, setTop] = useState(72);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // The panel and its scrim stay while they leave (fade + 4px up, 120ms; motion.md S6). Focus has
  // already gone back to the trigger, and they are inert from the first frame of the exit.
  const panelShown = usePresence(open && mode === "panel", [
    [panelRef, "panel"],
    [scrimRef, "overlay"],
  ]);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const update = () => {
      setDesktop(mq.matches);
      if (!mq.matches) void loadDialog();
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const openMenu = useCallback((focus: "search" | "title") => {
    setMode(window.matchMedia(DESKTOP).matches ? "panel" : "dialog");
    setTop(panelTop(triggerRef.current));
    setFocusSearch(focus === "search");
    setQuery("");
    setOpen(true);
  }, []);

  /** Closes; `returnFocus` puts focus back on the trigger (Escape, ×). The dialog does that itself. */
  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Route change closes the menu (AC-29).
  useEffect(() => setOpen(false), [pathname]);

  // Crossing the breakpoint while open closes it rather than switching container (H-4).
  useEffect(() => {
    if (open && desktop !== null && desktop !== (mode === "panel")) close(true);
  }, [desktop, mode, open, close]);

  // Raise the header above the tool page's dock and overlays while the panel is open.
  useEffect(() => {
    const header = wrapperRef.current?.closest("header");
    if (!header) return;
    if (open && mode === "panel") header.setAttribute("data-menu-open", "");
    else header.removeAttribute("data-menu-open");
  }, [open, mode]);

  // Keep the panel under the bar while the page scrolls or resizes.
  useEffect(() => {
    if (!open || mode !== "panel") return;
    const update = () => setTop(panelTop(triggerRef.current));
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open, mode]);

  // Panel: focus the search on open (AC-28); Escape closes and returns focus (AC-26).
  useEffect(() => {
    if (!open || mode !== "panel") return;
    searchRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      close(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, mode, close]);

  // Dialog: lock page scrolling behind it (AC-38).
  useEffect(() => {
    if (!open || mode !== "dialog") return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [open, mode]);

  // "/" focuses the home search, or opens the menu with its search focused (AC-61).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || isTyping(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      if (open) {
        searchRef.current?.focus();
        return;
      }
      const home = document.getElementById(CATALOGUE_SEARCH_ID);
      if (home) {
        home.scrollIntoView({ block: "center" });
        home.focus({ preventScroll: true });
      } else openMenu("search");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, openMenu]);

  const toggle = () => (open ? close(false) : openMenu(mode === "dialog" || desktop === false ? "title" : "search"));

  const content = (
    <MenuContent
      mode={mode}
      query={query}
      setQuery={setQuery}
      searchRef={searchRef}
      onClose={() => close(mode === "panel")}
      onChoose={() => close(false)}
    />
  );

  return (
    <div
      ref={wrapperRef}
      className="flex items-center"
      onBlur={(e) => {
        // Panel only: close once keyboard focus moves to something outside the trigger and panel.
        const next = e.relatedTarget;
        if (open && mode === "panel" && next instanceof Node && !wrapperRef.current?.contains(next)) close(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={MENU_ID}
        aria-haspopup={desktop === false ? "dialog" : undefined}
        onClick={toggle}
        data-testid="all-tools-button"
        // BerryPDF Header: the "All tools" pill chip (cream with a sand outline).
        className="ip-js-only mp-navlink mp-navlink--chip relative cursor-pointer before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 before:content-['']"
      >
        {siteCopy.menuButton}
        <ChevronDownIcon size={16} className={cx("transition-transform duration-(--dur-base)", open && "rotate-180")} />
      </button>
      <noscript>
        <Link href="/#tools" prefetch={false} className="mp-navlink mp-navlink--chip">
          {siteCopy.menuButton}
        </Link>
      </noscript>

      {panelShown && mode === "panel" && (
        <>
          {/* The page behind is dimmed and blurred; clicking it closes the panel. */}
          <div ref={scrimRef} aria-hidden="true" className="mp-menu-backdrop fixed" style={{ top }} onClick={() => close(true)} data-testid="tool-menu-scrim" />
          <div
            ref={panelRef}
            id={MENU_ID}
            className="mp-menu-panel fixed overflow-y-auto overscroll-contain"
            data-ip-scroll="overlay"
            style={{ top, maxHeight: `calc(100dvh - ${top}px - 24px)` }}
            data-testid="tool-menu"
          >
            <div className="relative mx-auto max-w-[1280px] px-6 pt-6 pb-5 lg:px-8">{content}</div>
          </div>
        </>
      )}
      {mode === "dialog" && (
        <Suspense>
          <Dialog
            open={open}
            onClose={() => close(false)}
            title={copy.title}
            variant="fullscreen"
            initialFocusRef={focusSearch ? searchRef : undefined}
            returnFocusRef={triggerRef}
          >
            <div id={MENU_ID} data-testid="tool-menu" className="px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
              {content}
            </div>
          </Dialog>
        </Suspense>
      )}
    </div>
  );
}

function MenuContent({
  mode,
  query,
  setQuery,
  searchRef,
  onClose,
  onChoose,
}: {
  mode: Mode;
  query: string;
  setQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onChoose: () => void;
}) {
  const { items, categories } = useToolIndex();
  const recent = useRecentTools();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState("");
  const matches = useMemo(() => matchTools(items, query), [items, query]);
  const searching = query.trim() !== "";
  const groups = categories
    .map((c) => ({ ...c, items: matches.filter((m) => m.item.category === c.id).map((m) => m.item) }))
    .filter((g) => g.items.length > 0);

  useEffect(() => {
    if (!searching) return setLive("");
    const t = setTimeout(() => setLive(copy.live(matches.length)), 400);
    return () => clearTimeout(t);
  }, [matches.length, searching]);

  const recentStrip = (layout: "inline" | "stacked") => (
    <RecentStrip
      items={recent}
      idPrefix="menu"
      level={2}
      inline={layout === "inline"}
      onClear={() => {
        clearRecent();
        setLive(copy.recentCleared);
        searchRef.current?.focus();
      }}
    />
  );
  const firstLink = () => resultsRef.current?.querySelector<HTMLAnchorElement>("a[href]") ?? null;
  const closeButton = <IconButton label={siteCopy.menuClose} icon={<CloseIcon />} tooltip={false} onClick={onClose} data-testid="tool-menu-close" />;

  const search = (
    <SearchField
      ref={searchRef}
      id="tool-menu-search"
      label={copy.searchLabel}
      hideLabel
      value={query}
      onChange={setQuery}
      onEnter={() => firstLink()?.click()}
      onArrowDown={() => firstLink()?.focus()}
      placeholder={copy.searchLabel}
      controls={RESULTS_ID}
      className="min-w-0 flex-1 md:max-w-[420px]"
    />
  );
  // Only while filtering (owner 2026-11-23: minimal text); the live region announces it too.
  const count = searching ? <span className="min-w-[9ch] text-sm text-muted tabular-nums">{copy.ofTotal(matches.length, items.length)}</span> : null;

  return (
    <div
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest("a[href]")) onChoose();
      }}
    >
      <LiveRegion message={live} />
      {mode === "panel" ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pe-14">
          {search}
          {count}
          {!searching && recentStrip("inline")}
        </div>
      ) : (
        <div className="sticky top-0 z-10 -mx-4 bg-surface-raised px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-2 shadow-[0_1.5px_0_var(--sand)]">
          <div className="flex items-center gap-2">
            {search}
            {closeButton}
          </div>
          {count && <div className="mt-1 text-xs">{count}</div>}
        </div>
      )}

      {mode === "dialog" && !searching && recent.length > 0 && <div className="mt-4 pb-2">{recentStrip("stacked")}</div>}

      <div ref={resultsRef} id={RESULTS_ID}>
        {groups.length === 0 ? (
          <div className="mt-6 flex flex-wrap items-center gap-3" data-testid="tool-menu-no-results">
            <p className="font-bold [overflow-wrap:anywhere]">{copy.none(query.trim())}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              {copy.clear}
            </Button>
          </div>
        ) : (
          <nav aria-label={copy.title} className={cx("mt-4 md:columns-3 md:gap-6 lg:columns-4 xl:columns-5", mode === "panel" ? "-mx-5" : "-mx-4")}>
            {/* Panel: balanced columns across the full width; a long group may continue in the next
                column (rows never split, a heading never ends a column) so no column runs long. */}
            {groups.map((g) => (
              <section
                key={g.id}
                aria-labelledby={`menu-cat-${g.id}`}
                className={cx("mb-4", mode === "dialog" && "break-inside-avoid", `ip-cat-${g.id}`)}
                data-testid="tool-menu-group"
              >
                {/* Category eyebrow: UPPERCASE in the category's text shade. */}
                <h2 id={`menu-cat-${g.id}`} className="mp-eyebrow flex break-after-avoid items-baseline gap-2 px-[15px] pt-1.5 pb-1">
                  {g.label}
                  <span className="text-sm text-muted normal-case tabular-nums">{g.items.length}</span>
                </h2>
                <ul>
                  {g.items.map((item) => (
                    <li key={item.slug} className="break-inside-avoid">
                      <MenuEntry item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        )}
      </div>
      {mode === "panel" && <div className="absolute top-5 end-4 lg:end-6">{closeButton}</div>}
    </div>
  );
}

function MenuEntry({ item }: { item: ToolIndexItem }) {
  const badge = badgeText(item);
  // Name from content, in DOM order: name, badge, runtime marker (AC-56, AC-59). Visible: icon,
  // name and a short "Soon"/"Beta" mark; the full status and runtime words are visually hidden.
  return (
    // BerryPDF Menu row: icon + label, 8x12 padding, 9px radius; hover gives a pink band and berry text.
    <Link href={`/${item.slug}`} prefetch={false} title={item.summary} className="mp-menu-row mx-2 gap-0.5 max-md:min-h-11">
      <span className="flex items-center gap-2">
        <span className={cx("shrink-0 [&_svg]:size-5", usable(item) ? "text-(--c)" : "text-muted")}>{item.icon}</span>
        <span className="ip-menu-name min-w-0 flex-1 [overflow-wrap:anywhere] text-ink">{item.name}</span>
        {badge && (
          <>
            <NameSep />
            {item.status === "planned" ? (
              <Badge tone="soon" className="mp-tag--sm">
                <span aria-hidden="true">{copy.soonShort}</span>
                <span className="sr-only">{badge}</span>
              </Badge>
            ) : (
              <Badge tone="beta">{badge}</Badge>
            )}
          </>
        )}
      </span>
      {item.runtime === "client" && (
        <>
          <NameSep />
          <span className="sr-only">{RUNTIME_CLIENT_TEXT}</span>
        </>
      )}
    </Link>
  );
}
