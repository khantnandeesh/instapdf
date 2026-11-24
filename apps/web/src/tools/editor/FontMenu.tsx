"use client";
/**
 * The font menu (F24): search, then one list with sticky section headers. "Closest matches"
 * (when a document font needs a stand-in), "In this document" (the PDF's own fonts, each with
 * the closest font we have and how close it is, in words), "Standard", "On this device" (the
 * person's own fonts: a file they pick, or installed fonts where the browser can list them) and
 * "All fonts" (the open font library). Fonts load one by one as their rows come into view.
 * Also the inline notice shown when a document font lacks a typed character.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { TEXT_FONTS, cssFamily } from "@/lib/editor/fonts";
import { ensureFace } from "@/lib/editor/fonts-browser";
import { foldName, searchFamilies } from "@/lib/font-library/client";
import { GRADE_LABEL, type FontMatch } from "@/lib/font-library/match";
import { USER_FONT_ACCEPT, canListLocalFonts, listLocalFonts, type LocalFontData } from "@/lib/font-library/user-fonts";
import { useCtl } from "./context";
import { familyOfFont } from "./controller";
import { addLocalFamily, addUserFontFile, fontLabel, getFontState, loadDocFonts, loadFontList, subscribeFontState, type DocFont } from "./font-service";
import { CloseBold } from "./icons";
import { Pop } from "./Pop";
import { useStore } from "./store";

export function useFontState() {
  return useSyncExternalStore(subscribeFontState, getFontState, getFontState);
}

/** Rows drawn at first, and added each time the end of the list comes into view. */
const PAGE = 60;

/** A font's name set in that font, loaded when the row scrolls into view. */
function Sample({ id, children, root }: { id: string; children: string; root: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        ensureFace(id, false, false, children).then(
          () => live && setReady(true),
          () => undefined,
        );
      },
      { root: root.current, rootMargin: "120px" },
    );
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [id, children, root]);
  return (
    <span ref={ref} className="ed-fonts__name" style={ready ? { fontFamily: `"${cssFamily(id)}", Arial, sans-serif` } : undefined}>
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={title}>
      <div className="ed-fonts__head" aria-hidden="true">
        {title}
      </div>
      {children}
    </div>
  );
}

const styleWords = (bold: boolean, italic: boolean) => [bold && "Bold", italic && "Italic"].filter(Boolean).join(" ");
/** "LiberationSerif" → "Liberation Serif": names inside PDFs have no spaces. */
export const spaced = (name: string) => name.replace(/([a-z])(Sans|Serif|Mono|Slab|Display|Text|Condensed|Narrow|New|Roman|Gothic|Script|Pro)(?![a-z])/g, "$1 $2");
const docLabel = (d: DocFont) => [spaced(d.info.family || familyOfFont(d.info.name)), styleWords(d.info.bold, d.info.italic)].filter(Boolean).join(" ");

/** The body of the font menu. `reference`: the document font (PostScript name) being replaced. */
export function FontMenuBody({ value, onPick, reference }: { value: string; onPick: (id: string) => void; reference?: string }) {
  const ctl = useCtl();
  const fonts = useFontState();
  const list = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [local, setLocal] = useState<Map<string, LocalFontData[]> | null>(null);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    loadFontList();
    ctl.startEngine();
    loadDocFonts(ctl.engineOpening, ctl.engineAllowed);
  }, [ctl]);

  const q = foldName(query);
  const hit = useCallback((name: string) => !q || foldName(name).includes(q), [q]);
  const lib = useMemo(() => (fonts.library ? searchFamilies(fonts.library.families, query) : []), [fonts.library, query]);
  const standard = TEXT_FONTS.filter((f) => hit(f.label) || hit(f.standsFor));
  const doc = fonts.doc.filter((d) => hit(docLabel(d)) || d.matches?.some((m) => hit(fontLabel(m.family))));
  const closest: FontMatch[] = (reference ? (fonts.doc.find((d) => d.key === familyKeyOf(reference, fonts.doc))?.matches ?? []) : []).filter((m) => hit(fontLabel(m.family)));
  const user = fonts.user.filter((u) => hit(u.label));
  const localRows = local ? [...local.keys()].filter((name) => hit(name) && !fonts.user.some((u) => u.label === name)) : [];

  // More rows as the end of the list comes into view (one scroll region, no "show more" button).
  const more = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setLimit((n) => n + PAGE), { root: list.current, rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [lib.length, localRows.length]);
  useEffect(() => setLimit(PAGE), [query]);

  const row = (key: string, id: string | null, label: ReactNode, hint?: ReactNode, onClick?: () => void, testId?: string) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={id != null && id === value}
      disabled={!onClick && id == null}
      data-testid={testId}
      data-font={id ?? undefined}
      className={cx("ed-menurow ed-fonts__row", id != null && id === value && "ed-menurow--on")}
      onClick={onClick ?? (() => id != null && onPick(id))}
    >
      {label}
      {hint != null && <span className="ed-fonts__hint">{hint}</span>}
    </button>
  );

  const add = async (make: () => Promise<{ id: string; label: string } | { error: string }>) => {
    setWorking(true);
    setMessage("");
    try {
      const out = await make();
      if ("error" in out) setMessage(out.error);
      else onPick(out.id);
    } catch {
      setMessage("That font couldn’t be read.");
    } finally {
      setWorking(false);
    }
  };

  const empty = !!q && !closest.length && !doc.length && !standard.length && !user.length && !localRows.length && !lib.length;

  return (
    <div className="ed-fonts" data-testid="font-menu">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search fonts"
        aria-label="Search fonts"
        className="ed-fonts__search"
        data-autofocus
        data-testid="font-search"
        autoComplete="off"
        spellCheck={false}
      />
      <div ref={list} className="ed-fonts__list" data-ip-scroll="overlay" role="listbox" aria-label="Font" aria-busy={working}>
        {closest.length > 0 && (
          <Section title="Closest matches">
            {closest.map((m) =>
              row(`c-${m.face}`, m.family, <Sample id={m.family} root={list}>{fontLabel(m.family)}</Sample>, GRADE_LABEL[m.grade], undefined, "font-closest"),
            )}
          </Section>
        )}
        {doc.length > 0 && (
          <Section title="In this document">
            {doc.map((d) => {
              const best = d.matches?.[0];
              const hint = d.matches == null ? "Matching…" : best ? `${fontLabel(best.family)} · ${GRADE_LABEL[best.grade]}` : "No match yet";
              return row(
                `d-${d.key}`,
                null,
                best ? <Sample id={best.family} root={list}>{docLabel(d)}</Sample> : <span className="ed-fonts__name">{docLabel(d)}</span>,
                hint,
                best ? () => onPick(best.family) : undefined,
                "font-doc",
              );
            })}
          </Section>
        )}
        {standard.length > 0 && (
          <Section title="Standard">
            {standard.map((f) => row(`s-${f.id}`, f.id, <Sample id={f.id} root={list}>{f.label}</Sample>, f.standsFor))}
          </Section>
        )}
        <Section title="On this device">
          {user.map((u) => row(`u-${u.id}`, u.id, <Sample id={u.id} root={list}>{u.label}</Sample>, "Yours"))}
          {localRows.slice(0, limit).map((name) =>
            row(`l-${name}`, null, <span className="ed-fonts__name">{name}</span>, undefined, () => void add(() => addLocalFamily(local!.get(name)!)), "font-local"),
          )}
          {row("add", null, <span className="ed-fonts__act">Add a font file</span>, undefined, () => file.current?.click(), "font-add")}
          {canListLocalFonts() &&
            !local &&
            row(
              "local",
              null,
              <span className="ed-fonts__act">Show installed fonts</span>,
              undefined,
              () =>
                void listLocalFonts().then((found) => {
                  if (found) setLocal(found);
                  else setMessage("The browser didn’t share the installed fonts.");
                }),
              "font-installed",
            )}
          {message && (
            <p className="ed-fonts__msg" role="alert" data-testid="font-error">
              {message}
            </p>
          )}
        </Section>
        {lib.length > 0 && (
          <Section title="All fonts">
            {lib.slice(0, limit).map((f) => row(`a-${f.i}`, f.i, <Sample id={f.i} root={list}>{f.n}</Sample>))}
          </Section>
        )}
        {empty && <p className="ed-fonts__msg">No font with that name.</p>}
        <div ref={more} aria-hidden="true" />
      </div>
      <input
        ref={file}
        type="file"
        accept={USER_FONT_ACCEPT}
        hidden
        data-testid="font-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void add(() => addUserFontFile(f));
        }}
      />
    </div>
  );
}

/** The document font row for a PostScript name as the engine reports it in a substitution. */
function familyKeyOf(reference: string, doc: readonly DocFont[]): string | undefined {
  const bare = reference.replace(/^[A-Z]{6}\+/, "");
  return (doc.find((d) => d.key === bare) ?? doc.find((d) => foldName(d.info.family) === foldName(familyOfFont(bare))))?.key;
}

/**
 * Inline notice after an edit whose characters the document font lacks: which font stands in,
 * with "Change" (the font menu, closest matches first) and "Use your own font". It sits with the
 * other notices and never takes focus or blocks typing.
 */
export function FontNotice() {
  const ctl = useCtl();
  const n = useStore(ctl.store, (s) => s.fontNotice);
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  useEffect(() => setMessage(""), [n?.key]);
  if (!n) return null;
  return (
    <div key={n.key} className="ed-toast ed-toast--font ed-glass" data-testid="font-notice">
      <span>{message || `${n.original} isn’t complete in this file. Using ${n.standIn}.`}</span>
      <Pop label="Change font" title="Change font" className="ed-toast__act ed-toast__act--pop" testId="font-change" trigger="Change" panelClassName="ed-fonts-pop">
        {(close) => (
          <FontMenuBody
            value={n.standInId}
            reference={n.fontName}
            onPick={(id) => {
              close();
              void ctl.changeStandIn(id);
            }}
          />
        )}
      </Pop>
      <button type="button" className="ed-toast__act" data-testid="font-own" onClick={() => file.current?.click()}>
        Use your own font
      </button>
      <input
        ref={file}
        type="file"
        accept={USER_FONT_ACCEPT}
        hidden
        data-testid="font-own-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          void addUserFontFile(f).then((out) => ("error" in out ? setMessage(out.error) : void ctl.changeStandIn(out.id)));
        }}
      />
      <button type="button" className="ed-toast__x" aria-label="Dismiss" onClick={() => ctl.store.set({ fontNotice: null })}>
        <CloseBold size={14} />
      </button>
    </div>
  );
}
