"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PlusIcon } from "@/components/ui/icons";
import { MenuButton, type MenuEntry } from "@/components/ui/Menu";
import { MoreIcon } from "@/components/ui/page-tool-icons";
import { TextInput } from "@/components/ui/TextInput";
import { addAfter, addChild, BOOKMARK_LIMITS, canIndent, canMoveDown, canMoveUp, canOutdent, indent, moveDown, moveUp, outdent, removeRow, rowsError, type BookmarkRow } from "@/lib/pdf/bookmark-edit";
import { bookmarksCopy as c } from "./copy";

/**
 * The bookmarks list (spec F10 §4): one row per bookmark, nested by its level. A row's name and
 * page are typed in place; its menu adds, moves, nests and deletes. Changes apply at once.
 */
export function BookmarksDialog({ open, onClose, rows, onChange, pageCount }: { open: boolean; onClose: () => void; rows: BookmarkRow[]; onChange: (rows: BookmarkRow[]) => void; pageCount: number }) {
  const done = useRef<HTMLButtonElement>(null);
  // A new row's name gets the focus once it is on screen.
  const focusKey = useRef("");
  useEffect(() => {
    if (!focusKey.current) return;
    const el = document.getElementById(`bm-title-${focusKey.current}`);
    focusKey.current = "";
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  });
  const added = (r: { rows: BookmarkRow[]; key: string }) => {
    focusKey.current = r.key;
    onChange(r.rows);
  };
  const patch = (i: number, p: Partial<BookmarkRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const error = rowsError(rows, pageCount);
  const full = rows.length >= BOOKMARK_LIMITS.rows;
  const menu = (i: number): MenuEntry[] => [
    { id: "below", label: c.menu.below, disabled: full, onSelect: () => added(addAfter(rows, i)) },
    { id: "inside", label: c.menu.inside, disabled: full || rows[i].level >= BOOKMARK_LIMITS.depth, onSelect: () => added(addChild(rows, i)) },
    { separator: true },
    { id: "up", label: c.menu.up, disabled: !canMoveUp(rows, i), onSelect: () => onChange(moveUp(rows, i)) },
    { id: "down", label: c.menu.down, disabled: !canMoveDown(rows, i), onSelect: () => onChange(moveDown(rows, i)) },
    { id: "in", label: c.menu.in, disabled: !canIndent(rows, i), onSelect: () => onChange(indent(rows, i)) },
    { id: "out", label: c.menu.out, disabled: !canOutdent(rows, i), onSelect: () => onChange(outdent(rows, i)) },
    { separator: true },
    { id: "remove", label: c.menu.remove, onSelect: () => onChange(removeRow(rows, i)) },
  ];
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
          <Button variant="soft" iconStart={<PlusIcon />} disabled={full} data-testid="bm-add" onClick={() => added(addAfter(rows, null))}>
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
            <ul className="ip-bm-list" data-testid="bm-list">
              {rows.map((r, i) => (
                <li key={r.key} className="ip-bm-row" data-level={r.level} style={{ paddingInlineStart: `${(Math.min(r.level, 7) - 1) * 16}px` }}>
                  <TextInput id={`bm-title-${r.key}`} label={c.nameOf(i + 1)} hideLabel value={r.title} placeholder={c.name} maxLength={BOOKMARK_LIMITS.title} onChange={(title) => patch(i, { title })} />
                  <TextInput id={`bm-page-${r.key}`} label={c.pageOf(r.title, i + 1)} hideLabel value={r.page} maxLength={6} onChange={(page) => patch(i, { page: page.replace(/[^\d]/g, "") })} className="ip-bm-page" />
                  <MenuButton label={c.more(r.title, i + 1)} items={menu(i)} placement="bottom-end" className="mp-iconbtn relative size-11" data-testid="bm-more">
                    <MoreIcon size={18} />
                  </MenuButton>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="ip-doc-note ip-bm-empty">{c.empty}</p>
        )}
        <p className="ip-bm-error" aria-live="polite" data-testid="bm-error">
          {error === "title" ? c.errors.title : error === "page" ? c.errors.page(pageCount) : " "}
        </p>
      </div>
    </Dialog>
  );
}
