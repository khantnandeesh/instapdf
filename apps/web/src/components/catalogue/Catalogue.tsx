"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearRecent } from "@/lib/recent-tools";
import { matchTools, normalizeQuery, type ToolMatch } from "@/lib/catalogue/search";
import { Button } from "../ui/Button";
import { SearchIcon } from "../ui/icons";
import { LiveRegion } from "../ui/LiveRegion";
import { SearchField } from "../ui/SearchField";
import { Switch } from "../ui/Switch";
import { catalogueCopy as copy } from "./copy";
import { RecentStrip } from "./RecentStrip";
import { ToolCard, ToolTile } from "./ToolCard";
import { useToolIndex } from "./ToolIndexProvider";
import { CATALOGUE_SEARCH_ID, usable, type ToolIndexItem } from "./types";
import { useRecentTools } from "./useRecentTools";

const LIVE_DELAY_MS = 400;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Home catalogue (spec F2 §3b, H-5): search, ready-only filter, category jump
 * links, Recent, Popular and the eight category groups. Server-rendered with an
 * empty query, so the HTML holds every tool link (AC-12). `?q` is read from
 * `location` after mount (never useSearchParams, which would drop the SSR cards).
 */
export function Catalogue() {
  const { items, categories } = useToolIndex();
  const [query, setQuery] = useState("");
  const [readyOnly, setReadyOnly] = useState(false);
  const [live, setLive] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const userChanged = useRef(false);
  const recent = useRecentTools();

  // ---- query <-> URL (AC-62) ---------------------------------------------------
  const initialized = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
    initialized.current = true;
  }, []);
  useEffect(() => {
    if (!initialized.current) return;
    const url = new URL(window.location.href);
    const q = query.trim();
    if (q) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [query]);

  const updateQuery = useCallback((q: string) => {
    userChanged.current = true;
    setQuery(q);
  }, []);

  // ---- filtering -------------------------------------------------------------------
  const searching = normalizeQuery(query) !== "";
  const matches = useMemo(() => matchTools(items, query).filter((m) => !readyOnly || usable(m.item)), [items, query, readyOnly]);
  const groups = useMemo(
    () => categories.map((c) => ({ ...c, matches: matches.filter((m) => m.item.category === c.id) })).filter((g) => g.matches.length > 0),
    [categories, matches],
  );
  const popular = useMemo(() => {
    const ranked = items.filter((i) => i.popularRank !== undefined).sort((a, b) => a.popularRank! - b.popularRank!);
    return [...ranked.filter(usable), ...(readyOnly ? [] : ranked.filter((i) => !usable(i)))];
  }, [items, readyOnly]);
  const readyCount = items.filter(usable).length;

  // Polite announcement after typing stops (AC-21); none on load.
  useEffect(() => {
    if (!userChanged.current) return;
    const t = setTimeout(() => setLive(copy.live(matches.length)), LIVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [matches.length, query, readyOnly]);

  // ---- hero call to action: scroll to the catalogue and focus search (AC-3) ----------
  const focusSearch = useCallback(() => {
    headingRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    searchRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest("[data-focus-search]") : null;
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const url = new URL(window.location.href);
      url.hash = "tools";
      window.history.pushState(window.history.state, "", url);
      focusSearch();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [focusSearch]);

  // ---- recent ------------------------------------------------------------------------
  const hadRecent = useRef(false);
  useEffect(() => {
    const root = document.documentElement;
    if (recent.length) root.setAttribute("data-recent", "");
    else if (hadRecent.current) root.removeAttribute("data-recent");
    hadRecent.current = recent.length > 0;
  }, [recent.length]);
  const onClearRecent = useCallback(() => {
    clearRecent();
    setLive(copy.recentCleared);
    searchRef.current?.focus();
  }, []);

  const clearSearch = useCallback(() => {
    updateQuery("");
    searchRef.current?.focus();
  }, [updateQuery]);

  return (
    // BerryPDF Home: the catalogue, grouped under coloured eyebrows, right on the grid paper (the only
    // background); the hero above is set off by spacing and one vine divider (page.tsx).
    <section aria-labelledby="tools-heading" className="pt-(--space-7) pb-(--space-8)" data-testid="catalogue">
      <div className="mx-auto max-w-[1170px] px-[15px]">
        <div id="tools" ref={headingRef} className="scroll-mt-[calc(var(--ip-header-h)+16px)] text-center">
          <h2 id="tools-heading" className="text-section-title text-ink">
            {copy.title}
          </h2>
          <p className="mt-2.5 text-subtitle text-muted tabular-nums">{copy.summary(items.length, readyCount)}</p>
        </div>

        <div className="mx-auto mt-6 flex max-w-[957px] flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <SearchField
            ref={searchRef}
            id={CATALOGUE_SEARCH_ID}
            label={copy.searchLabel}
            hideLabel
            size="lg"
            value={query}
            onChange={updateQuery}
            onEscape={() => updateQuery("")}
            placeholder={copy.searchPlaceholder}
            shortcutHint
            className="w-full md:max-w-[480px] md:flex-1"
          />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-x-5 md:flex-none md:contents">
            <Switch id="ready-only" label={copy.readyOnly} checked={readyOnly} onChange={(v) => {
              userChanged.current = true;
              setReadyOnly(v);
            }} />
            <span className="min-w-[8ch] text-end text-sm text-muted tabular-nums" data-testid="catalogue-count">
              {copy.shown(matches.length)}
            </span>
          </div>
        </div>
        <LiveRegion message={live} />

        {!searching && (
          // Inline padding offset by negative margins keeps edge chips' focus outlines inside the scroller.
          <nav aria-label={copy.jumpLabel} className="ip-scroll-x -mx-1.5 mt-4 px-1.5">
            <ul className="flex gap-2 py-1.5 max-lg:flex-nowrap lg:flex-wrap lg:justify-center">
              {groups.map((g) => (
                <li key={g.id} className="shrink-0">
                  <a href={`#cat-${g.id}`} className="mp-navlink mp-navlink--chip">
                    {g.label}
                    <span className="ms-1 text-muted tabular-nums">{g.matches.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="mx-auto lg:w-[957px]">
          {!searching && (
            <div className="ip-recent-slot mt-8">
              <RecentStrip items={readyOnly ? recent.filter(usable) : recent} onClear={onClearRecent} idPrefix="home" />
            </div>
          )}

          {!searching && popular.length > 0 && (
            <section aria-labelledby="popular-heading" className="ip-cat-popular mt-8" data-testid="popular">
              <h3 id="popular-heading" className="mp-eyebrow">
                {copy.popularTitle}
              </h3>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-[repeat(3,300px)] lg:gap-x-[28.5px]">
                {popular.map((item) => (
                  <li key={item.slug} className={`ip-cat-${item.category}`}>
                    <ToolTile item={item} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groups.length === 0 ? (
            <NoResults query={query.trim()} onClear={clearSearch} />
          ) : (
            groups.map((g) => <CategorySection key={g.id} id={g.id} label={g.label} matches={g.matches} searching={searching} />)
          )}
        </div>
      </div>
    </section>
  );
}

function CategorySection({ id, label, matches, searching }: { id: string; label: string; matches: ToolMatch<ToolIndexItem>[]; searching: boolean }) {
  return (
    <section id={`cat-${id}`} aria-labelledby={`cat-${id}-heading`} className={`ip-cat-${id} mt-8 scroll-mt-[calc(var(--ip-header-h)+16px)]`} data-testid="category">
      {/* BerryPDF eyebrow: UPPERCASE Fredoka in the category's berry colour (text shade, see tokens.css). */}
      <div className="flex items-baseline gap-3">
        <h3 id={`cat-${id}-heading`} className="mp-eyebrow">
          {label}
        </h3>
        <span className="text-sm text-muted tabular-nums">{copy.groupCount(matches.length)}</span>
      </div>
      <ul role="list" className="grid grid-cols-1 gap-y-5 sm:grid-cols-2 sm:gap-x-5 lg:grid-cols-[repeat(3,300px)] lg:gap-x-[28.5px]">
        {matches.map((m) => (
          <li key={m.item.slug}>
            <ToolCard item={m.item} nameRange={searching ? m.name : undefined} summaryRange={searching ? m.summary : undefined} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-2 py-8 text-center" data-testid="no-results">
      <span className="grid size-16 place-items-center rounded-full bg-surface-raised text-brand-strong shadow-card">
        <SearchIcon size={30} />
      </span>
      <p className="mt-2 font-bold [overflow-wrap:anywhere]">{copy.none(query)}</p>
      {/* Same size as the line above: a bold line over a smaller one reads as a heading to axe (p-as-heading). */}
      <p className="text-muted">{copy.tip}</p>
      <Button variant="outline" className="mt-2" onClick={onClear}>
        {copy.clear}
      </Button>
    </div>
  );
}
