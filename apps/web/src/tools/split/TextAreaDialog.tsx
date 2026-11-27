"use client";
import { useEffect, useRef, useState } from "react";
import { AreaSelect } from "@/components/page-edit/AreaSelect";
import { renderSize } from "@/components/tool-flow/preview-fit";
import type { FlowApi, LoadedFile } from "@/components/tool-flow/types";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import type { Area } from "@/lib/pdf/area";
import { splitTextCopy as c } from "./copy";

/** The page is drawn once at this size (CSS px, longer side) and scaled by the layout. */
const DRAW = 640;

/**
 * Split by text (spec F7 §5): the person drags a box around the text that changes from one document
 * to the next. The box applies at once (the cut lines behind follow it); the line under the page
 * says what text it catches on the page shown.
 */
export function TextAreaDialog({
  open,
  onClose,
  file,
  api,
  area,
  onChange,
  textAt,
}: {
  open: boolean;
  onClose: () => void;
  file: LoadedFile | undefined;
  api: FlowApi | null;
  area: Area;
  onChange: (area: Area) => void;
  /** The text the area catches on a page of `file`. */
  textAt: (index: number) => string;
}) {
  const [at, setAt] = useState(0);
  const host = useRef<HTMLSpanElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const count = file?.pageCount ?? 0;
  const index = Math.min(at, Math.max(0, count - 1));
  const size = file?.pages?.[index] ?? { width: 1, height: 1.414 };
  const id = file?.id;

  useEffect(() => {
    if (!open || !id || !api) return;
    host.current?.replaceChildren();
    return api.renderPage(
      id,
      index,
      renderSize(DRAW, window.devicePixelRatio),
      (canvas) => {
        canvas.className = "block h-full w-full";
        host.current?.replaceChildren(canvas);
      },
    );
  }, [open, id, index, api]);

  const text = textAt(index);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      onCloseButton={onClose}
      title={c.dialogTitle}
      description={c.dialogHelp}
      initialFocusRef={done}
      footer={
        <Button ref={done} variant="primary" onClick={onClose}>
          {c.done}
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <AreaSelect
          value={area}
          onChange={onChange}
          label={c.areaLabel}
          className="overflow-hidden rounded-md bg-white shadow-[0_0_0_1px_var(--border)]"
        >
          <span
            ref={host}
            aria-hidden="true"
            className="block"
            style={{
              aspectRatio: `${size.width} / ${size.height}`,
              width: `min(100%, calc(52dvh * ${size.width / size.height}))`,
              minWidth: `min(100%, calc(52dvh * ${size.width / size.height}))`,
            }}
          />
        </AreaSelect>
        <div className="flex w-full items-center gap-2">
          <p
            className="min-w-0 flex-1 truncate text-sm text-ink"
            aria-live="polite"
            data-testid="area-text"
          >
            {text ? (
              <>
                {c.found}{" "}
                <strong className="font-semibold text-ink-black">{text}</strong>
              </>
            ) : (
              c.nothing
            )}
          </p>
          {count > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                label={c.prev}
                size="sm"
                disabled={index === 0}
                onClick={() => setAt(index - 1)}
                icon={<ChevronLeftIcon size={16} />}
              />
              <span className="min-w-[4.5ch] text-center text-sm tabular-nums text-ink">
                {index + 1} / {count}
              </span>
              <IconButton
                label={c.next}
                size="sm"
                disabled={index >= count - 1}
                onClick={() => setAt(index + 1)}
                icon={<ChevronRightIcon size={16} />}
              />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
