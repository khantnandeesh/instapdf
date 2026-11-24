"use client";
/**
 * The forms UI as its own chunk (F16 E3): fetched only once the file has fields, Detect has
 * proposals, or the Form tool is picked, so the editor's first load carries none of it.
 */
import dynamic from "next/dynamic";
import { Component, type ComponentProps, type ReactNode } from "react";
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

/**
 * If the forms chunk fails to load (offline, a deploy replaced it), the forms UI stays away and
 * the rest of the editor keeps working, instead of the whole editor going to its error screen.
 */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn("Form fields could not load", e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** True once there is anything for the forms UI to show. */
function useFormsOn(): boolean {
  const { store } = useCtl();
  return useStore(store, (s) => s.tool === "form" || !!formsOf(s)?.fields.length || s.forms.proposals.length > 0 || s.forms.detect.phase !== "idle");
}

export function PageFields(p: ComponentProps<typeof UI.PageFields>) {
  return useFormsOn() ? <Guard><PageFieldsUI {...p} /></Guard> : null;
}
export function FieldPopover(p: ComponentProps<typeof UI.FieldPopover>) {
  return useFormsOn() ? <Guard><FieldPopoverUI {...p} /></Guard> : null;
}
export function FormsChrome(p: ComponentProps<typeof UI.FormsChrome>) {
  return useFormsOn() ? <Guard><FormsChromeUI {...p} /></Guard> : null;
}
export function FormsToolOptions() {
  return (
    <Guard>
      <FormsToolOptionsUI />
    </Guard>
  );
}
export function FieldsChipSlot() {
  return useFormsOn() ? <Guard><FieldsChipSlotUI /></Guard> : null;
}
export function TabOrderTab() {
  return (
    <Guard>
      <TabOrderTabUI />
    </Guard>
  );
}
