"use client";
import type { Permission } from "@/tools/registry";
import { Notice } from "../ui/Notice";
import { permissionLabels } from "./copy";

/**
 * Shown when a tool needs a permission the file denies (deferred consumers:
 * F16 Editor, F17 Sign; spec D-1, D-2). Rotate needs none, so it never shows.
 */
export function OwnerPermissionNotice({ fileName, denied, onEnterPassword }: { fileName: string; denied: Permission[]; onEnterPassword: () => void }) {
  return (
    <Notice tone="warning" title={`${fileName} has limited permissions`} action={{ label: "Enter owner password", onClick: onEnterPassword }}>
      This tool needs a permission the file does not allow: {denied.map((p) => permissionLabels[p].toLowerCase()).join(", ")}.
    </Notice>
  );
}
