"use client";
/**
 * The forms UI as its own chunk (F16 E3): fetched only once the file has fields, Detect has
 * proposals, or the Form tool is picked, so the editor's first load carries none of it.
 */
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { useStore } from "@/tools/editor/store";
import { useCtl } from "@/tools/editor/context";
import { formsOf } from "./core";
import type * as UI from "./EditorForms";

const load = () => import("./EditorForms");
const PageFieldsUI = dynamic(() => load().then((m) => m.PageFields), { ssr: false, loading: () => null });
const FieldPopoverUI = dynamic(() => load().then((m) => m.FieldPopover), { ssr: false, loading: () => null });
const FormsChromeUI = dynamic(() => load().then((m) => m.FormsChrome), { ssr: false, loading: () => null });
const FormsToolOptionsUI = dynamic(() => load().then((m) => m.FormsToolOptions), { ssr: false, loading: () => null });
const FieldsChipSlotUI = dynamic(() => load().then((m) => m.FieldsChipSlot), { ssr: false, loading: () => null });
const TabOrderTabUI = dynamic(() => load().then((m) => m.TabOrderTab), { ssr: false, loading: () => null });

/** True once there is anything for the forms UI to show. */
function useFormsOn(): boolean {
  const { store } = useCtl();
  return useStore(store, (s) => s.tool === "form" || !!formsOf(s)?.fields.length || s.forms.proposals.length > 0 || s.forms.detect.phase !== "idle");
}

export function PageFields(p: ComponentProps<typeof UI.PageFields>) {
  return useFormsOn() ? <PageFieldsUI {...p} /> : null;
}
export function FieldPopover(p: ComponentProps<typeof UI.FieldPopover>) {
  return useFormsOn() ? <FieldPopoverUI {...p} /> : null;
}
export function FormsChrome(p: ComponentProps<typeof UI.FormsChrome>) {
  return useFormsOn() ? <FormsChromeUI {...p} /> : null;
}
export function FormsToolOptions() {
  return <FormsToolOptionsUI />;
}
export function FieldsChipSlot() {
  return useFormsOn() ? <FieldsChipSlotUI /> : null;
}
export function TabOrderTab() {
  return <TabOrderTabUI />;
}
