"use client";
import { AreaDialog } from "@/components/page-edit/AreaDialog";
import type { FlowApi, LoadedFile } from "@/components/tool-flow/types";
import { Button } from "@/components/ui/Button";
import type { Area } from "@/lib/pdf/area";
import { cropCopy as c } from "./copy";

const MM = 25.4 / 72;

/** Crop (spec F8 §3): the person drags a box around what should stay; the line under the page says how big the result is. */
export function CropAreaDialog({
  onFit,
  ...rest
}: {
  open: boolean;
  onClose: () => void;
  file: LoadedFile | undefined;
  api: FlowApi | null;
  area: Area;
  onChange: (area: Area) => void;
  /** Sets the box to the content of the page shown. */
  onFit: (index: number) => void;
}) {
  return (
    <AreaDialog
      {...rest}
      title={c.dialogTitle}
      help={c.dialogHelp}
      areaLabel={c.areaLabel}
      status={(index) => {
        const page = rest.file?.pages?.[index];
        return page ? c.result(Math.round(page.width * rest.area.w * MM), Math.round(page.height * rest.area.h * MM)) : "";
      }}
      action={(index) => (
        <Button variant="ghost" onClick={() => onFit(index)} data-testid="fit-content">
          {c.fit}
        </Button>
      )}
    />
  );
}
