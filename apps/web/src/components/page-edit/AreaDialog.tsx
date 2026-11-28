"use client";
import type { Area } from "@/lib/pdf/area";
import { AreaSelect } from "./AreaSelect";
import { PageDialog, pageDialogCopy, type PageDialogProps } from "./PageDialog";

export const areaDialogCopy = pageDialogCopy;

/**
 * A dialog with one page and a box to drag on it (Split by text, Crop). The box applies at once;
 * `status` is the line under the page that says what the box does on the page shown, and `action`
 * an extra button beside Done. The arrows step through the file's pages.
 */
export function AreaDialog({ area, onChange, areaLabel, ...rest }: PageDialogProps & { area: Area; onChange: (area: Area) => void; areaLabel: string }) {
  return (
    <PageDialog
      {...rest}
      frame={(page) => (
        <AreaSelect value={area} onChange={onChange} label={areaLabel} className="ip-area--page">
          {page}
        </AreaSelect>
      )}
    />
  );
}
