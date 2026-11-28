"use client";
import { memo, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PlusIcon } from "@/components/ui/icons";
import { MenuButton, type MenuEntry } from "@/components/ui/Menu";
import { MoreIcon } from "@/components/ui/page-tool-icons";
import { TextInput } from "@/components/ui/TextInput";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { addAfter, addChild, BOOKMARK_LIMITS, canIndent, canMoveDown, canMoveUp, canOutdent, indent, moveDown, moveUp, outdent, removeRow, rowsError, subtreeEnd, type BookmarkRow } from "@/lib/pdf/bookmark-edit";
import { bookmarksCopy as c } from "./bookmarks-copy";

type Act = "title" | "page" | "below" | "inside" | "up" | "down" | "in" | "out" | "remove";
type RowProps = { row: BookmarkRow; n: number; full: boolean; up: boolean; down: boolean; inn: boolean; out: boolean; act: (key: string, what: Act, value?: string) => void };

/** One bookmark. Memoised: typing in one row draws that row, not the whole list. */
const Row = memo(function Row({ row: r, n, full, up, down, inn, out, act }: RowProps) {
  const menu: MenuEntry[] = [
    { id: "below", label: c.menu.below, disabled: full, onSelect: () => act(r.key, "below") },
    { id: "inside", label: c.menu.inside, disabled: full || r.level >= BOOKMARK_LIMITS.depth, onSelect: () => act(r.key, "inside") },
    { separator: true },
    { id: "up", label: c.menu.up, disabled: !up, onSelect: () => act(r.key, "up") },
    { id: "down", label: c.menu.down, disabled: !down, onSelect: () => act(r.key, "down") },
    { id: "in", label: c.menu.in, disabled: !inn, onSelect: () => act(r.key, "in") },
    { id: "out", label: c.menu.out, disabled: !out, onSelect: () => act(r.key, "out") },
    { separator: true },
    { id: "remove", label: c.menu.remove, onSelect: () => act(r.key, "remove") },
  ];
  return (
    <li className="ip-bm-row" data-level={r.level} style={{ paddingInlineStart: `${(r.level - 1) * 12}px` }}>
      <TextInput id={`bm-title-${r.key}`} label={c.nameOf(n, r.level)} hideLabel value={r.title} placeholder={c.name} maxLength={Math.max(BOOKMARK_LIMITS.title, r.title.length)} onChange={(v) => act(r.key, "title", v)} />
      <TextInput id={`bm-page-${r.key}`} label={c.pageOf(r.title, n)} hideLabel value={r.page} placeholder={r.src && r.src.page < 0 ? c.noPage : undefined} maxLength={6} inputMode="numeric" onChange={(v) => act(r.key, "page", v)} className="ip-bm-page" />
      <MenuButton label={c.more(r.title, n)} items={menu} placement="bottom-end" className="mp-iconbtn relative size-11" data-testid="bm-more">
        <MoreIcon size={18} />
      </MenuButton>
    </li>
  );
});

/**
 * The bookmarks list (spec F10 §4): one row per bookmark, nested by its level. A row's name and
 * page are typed in place; its menu adds, moves, nests and deletes. Changes apply at once. The
 * list is the dialog's one scroller; the buttons stay in view under it.
 */
export function BookmarksDialog({ open, onClose, rows, onChange, pageCount }: { open: boolean; onClose: () => void; rows: BookmarkRow[]; onChange: (rows: BookmarkRow[]) => void; pageCount: number }) {
  const done = useRef<HTMLButtonElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const [said, setSaid] = useState("");
  // After a change, the focus goes to the row it was about (its name), so the keyboard keeps its place.
  const focusKey = useRef<string | null>(null);
  useEffect(() => {
    const key = focusKey.current;
    if (key === null) return;
    focusKey.current = null;
    const el = key ? document.getElementById(`bm-title-${key}`) : add.current;
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  });
  const live = useRef({ rows, onChange });
  live.current = { rows, onChange };
  // One stable handler for every row (rows are memoised on it).
  const act = useRef((key: string, what: Act, value = "") => {
    const { rows: list, onChange: set } = live.current;
    const i = list.findIndex((r) => r.key === key);
    if (i < 0) return;
    const put = (next: BookmarkRow[], focus: string | null, say: string) => {
      focusKey.current = focus;
      if (say) setSaid(say);
      set(next);
    };
    if (what === "title") set(list.map((r) => (r.key === key ? { ...r, title: value } : r)));
    else if (what === "page") set(list.map((r) => (r.key === key ? { ...r, page: value.replace(/[^\d]/g, "") } : r)));
    else if (what === "below" || what === "inside") {
      const r = what === "below" ? addAfter(list, i) : addChild(list, i);
      if (r.key) put(r.rows, r.key, c.said.added);
    } else if (what === "up") put(moveUp(list, i), key, c.said.up);
    else if (what === "down") put(moveDown(list, i), key, c.said.down);
    else if (what === "in") put(indent(list, i), key, c.said.in(list[i].level + 1));
    else if (what === "out") put(outdent(list, i), key, c.said.out(list[i].level - 1));
    else {
      const end = subtreeEnd(list, i);
      // The row after what went, or the one before, or the Add button when the list is empty.
      put(removeRow(list, i), list[end]?.key ?? list[i - 1]?.key ?? "", c.said.removed(end - i));
    }
  }).current;
  const error = rowsError(rows, pageCount);
  const full = rows.length >= BOOKMARK_LIMITS.rows;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      onCloseButton={onClose}
      title={c.dialogTitle}
      description={c.dialogHelp}
      initialFocusRef={done}
      footer={
        <>
          <Button
            ref={add}
            variant="soft"
            iconStart={<PlusIcon />}
            disabled={full}
            data-testid="bm-add"
            onClick={() => {
              const r = addAfter(rows, null);
              focusKey.current = r.key;
              setSaid(c.said.added);
              onChange(r.rows);
            }}
          >
            {c.add}
          </Button>
          <Button ref={done} variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="ip-bm">
        {rows.length ? (
          <>
            <div className="ip-bm-head" aria-hidden="true">
              <span>{c.name}</span>
              <span>{c.page}</span>
            </div>
            <ul className="ip-bm-list" data-testid="bm-list" data-ip-scroll="overlay">
              {rows.map((r, i) => (
                <Row key={r.key} row={r} n={i + 1} full={full} up={canMoveUp(rows, i)} down={canMoveDown(rows, i)} inn={canIndent(rows, i)} out={canOutdent(rows, i)} act={act} />
              ))}
            </ul>
          </>
        ) : (
          <p className="ip-doc-note ip-bm-empty">{c.empty}</p>
        )}
        <p className="ip-bm-error" aria-live="polite" data-testid="bm-error">
          {error === "title" ? c.errors.title : error === "page" ? c.errors.page(pageCount) : " "}
        </p>
        <VisuallyHidden>
          <span aria-live="polite" data-testid="bm-said">
            {said}
          </span>
        </VisuallyHidden>
      </div>
    </Dialog>
  );
}
