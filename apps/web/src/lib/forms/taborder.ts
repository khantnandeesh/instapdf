/**
 * Tab order (AC-239): sort by rows, sort by columns, restore original, custom moves. The order is
 * one list of widget ids; the output keeps each page's widgets in that order (`/Annots`), and pages
 * in page order.
 */
import { frameBoxToView } from "./detect/view";
import { pageTurn } from "./frame";
import type { FormPage, FormState, Widget } from "./types";

type Placed = Widget & { pageIndex: number };

/** Widgets with their boxes as the reader sees the page, so rows stay rows on turned pages. */
function placed(state: FormState, pages: FormPage[]): Placed[] {
  const index = new Map(pages.map((p, i) => [p.id, i]));
  return state.fields.flatMap((f) =>
    f.widgets
      .filter((w) => index.has(w.page))
      .map((w) => {
        const p = pages[index.get(w.page)!];
        const box = frameBoxToView({ w: p.view[2] - p.view[0], h: p.view[3] - p.view[1], turn: pageTurn(p) }, w);
        return { ...w, ...box, pageIndex: index.get(w.page)! };
      }),
  );
}

/**
 * Groups widgets into lines along one axis: a widget joins the current line when its centre lies
 * inside the line's span on that axis (so fields of different heights on one row stay together).
 */
function lines(ws: Placed[], axis: "y" | "x"): Placed[][] {
  const size = axis === "y" ? "h" : "w";
  const sorted = [...ws].sort((a, b) => a[axis] - b[axis]);
  const out: { lo: number; hi: number; items: Placed[] }[] = [];
  for (const w of sorted) {
    const c = w[axis] + w[size] / 2;
    const line = out.find((l) => c >= l.lo && c <= l.hi);
    if (line) {
      line.items.push(w);
      line.lo = Math.min(line.lo, w[axis]);
      line.hi = Math.max(line.hi, w[axis] + w[size]);
    } else out.push({ lo: w[axis], hi: w[axis] + w[size], items: [w] });
  }
  return out.sort((a, b) => a.lo - b.lo).map((l) => l.items);
}

/** Rows top to bottom, left to right within a row (`/Tabs /R`). */
export function sortByRows(state: FormState, pages: FormPage[]): FormState {
  return { ...state, orderMode: "rows", order: byPage(placed(state, pages), (ws) => lines(ws, "y").flatMap((row) => row.sort((a, b) => a.x - b.x))) };
}

/** Columns left to right, top to bottom within a column (`/Tabs /C`). */
export function sortByColumns(state: FormState, pages: FormPage[]): FormState {
  return { ...state, orderMode: "columns", order: byPage(placed(state, pages), (ws) => lines(ws, "x").flatMap((col) => col.sort((a, b) => a.y - b.y))) };
}

function byPage(ws: Placed[], sortPage: (ws: Placed[]) => Placed[]): string[] {
  const pages = new Map<number, Placed[]>();
  for (const w of ws) pages.set(w.pageIndex, [...(pages.get(w.pageIndex) ?? []), w]);
  return [...pages.keys()].sort((a, b) => a - b).flatMap((p) => sortPage(pages.get(p)!).map((w) => w.id));
}

/** The order the file had; fields added since follow, in the order they were added. */
export function restoreOriginal(state: FormState): FormState {
  const all = new Set(state.fields.flatMap((f) => f.widgets.map((w) => w.id)));
  const original = state.originalOrder.filter((id) => all.has(id));
  const rest = state.order.filter((id) => !original.includes(id));
  return { ...state, orderMode: "original", order: [...original, ...rest] };
}

/** Custom order: moves a widget to position `to` among the widgets of its page. */
export function moveInOrder(state: FormState, widgetId: string, to: number, pages: FormPage[]): FormState {
  const pageOf = new Map(state.fields.flatMap((f) => f.widgets.map((w) => [w.id, w.page] as const)));
  const page = pageOf.get(widgetId);
  if (page == null) return state;
  const onPage = state.order.filter((id) => pageOf.get(id) === page && id !== widgetId);
  const clamped = Math.max(0, Math.min(to, onPage.length));
  onPage.splice(clamped, 0, widgetId);
  const pageIndex = new Map(pages.map((p, i) => [p.id, i]));
  const others = state.order.filter((id) => pageOf.get(id) !== page);
  // Rebuild: pages in page order, each page's ids in their (new) order.
  const groups = new Map<string, string[]>();
  for (const id of [...others, ...onPage]) {
    const p = pageOf.get(id)!;
    groups.set(p, [...(groups.get(p) ?? []), id]);
  }
  groups.set(page, onPage);
  const order = [...groups.keys()].sort((a, b) => (pageIndex.get(a) ?? 1e9) - (pageIndex.get(b) ?? 1e9)).flatMap((p) => groups.get(p)!);
  return { ...state, orderMode: "custom", order };
}

/** The tab order of one page's widgets (the file's hidden ones left out: nobody can tab to them). */
export function pageOrder(state: FormState, pageId: string): string[] {
  const onPage = new Set(state.fields.flatMap((f) => f.widgets.filter((w) => w.page === pageId && !w.hidden).map((w) => w.id)));
  const listed = state.order.filter((id) => onPage.has(id));
  return [...listed, ...[...onPage].filter((id) => !listed.includes(id))];
}
