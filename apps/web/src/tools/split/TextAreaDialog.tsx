"use client";
import { AreaDialog } from "@/components/page-edit/AreaDialog";
import type { FlowApi, LoadedFile } from "@/components/tool-flow/types";
import type { Area } from "@/lib/pdf/area";
import { splitTextCopy as c } from "./copy";

/**
 * Split by text (spec F7 §5): the person drags a box around the text that changes from one document
 * to the next. The box applies at once (the cut lines behind follow it); the line under the page
 * says what text it catches on the page shown.
 */
export function TextAreaDialog({
  textAt,
  ...rest
}: {
  open: boolean;
  onClose: () => void;
  file: LoadedFile | undefined;
  api: FlowApi | null;
  area: Area;
  onChange: (area: Area) => void;
  /** The text the area catches on a page of the file. */
  textAt: (index: number) => string;
}) {
  return (
    <AreaDialog
      {...rest}
      title={c.dialogTitle}
      help={c.dialogHelp}
      areaLabel={c.areaLabel}
      status={(index) => {
        const text = textAt(index);
        return text ? (
          <>
            {c.found} <strong className="font-semibold text-ink-black">{text}</strong>
          </>
        ) : (
          c.nothing
        );
      }}
    />
  );
}
