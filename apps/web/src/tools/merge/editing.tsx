"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { onIntent } from "@/components/tool-flow/intent";
import type { PageWorkspace } from "./workspace";

/**
 * The editing parts of Merge, Combine & reorder and Organize (page-editing.tsx), loaded apart from
 * the route: nothing of them is drawn before the first file is in, so they are prefetched at the
 * first sign of intent, with the views, and never part of the first load (F3 M-10, F4/F5 P-12).
 */
const load = () => import("./page-editing");
export const EditWorkspace = dynamic(() => load().then((m) => m.EditWorkspace), { ssr: false, loading: () => <div className="h-40" aria-hidden="true" /> });
export const AddMenus = dynamic(() => load().then((m) => m.AddMenus), { ssr: false, loading: () => <span className="inline-block h-11 w-11 shrink-0" aria-hidden="true" /> });
const Dialogs = dynamic(() => load().then((m) => m.EditorDialogs), { ssr: false });

/** The dialogs, once one has been opened. */
export function EditorDialogs({ ws }: { ws: PageWorkspace }) {
  return ws.dialogsUsed ? <Dialogs ws={ws} /> : null;
}

/** Prefetches the editing parts at the first pointer, key, focus or drag (or after a few seconds). */
export function usePrefetchEditing() {
  useEffect(() => onIntent(() => void load().catch(() => {})), []);
}
