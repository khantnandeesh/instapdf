"use client";
import dynamic from "next/dynamic";
import { useEffect, type ComponentProps } from "react";
import type { FieldBubble } from "./FieldBubble";

const Bubble = dynamic(() => import("./FieldBubble").then((m) => m.FieldBubble), { ssr: false, loading: () => <BubbleSlot /> });

/** The side panel's reserved 20px line under a field, while nothing is said (no layout shift). */
export function BubbleSlot() {
  return <span aria-hidden="true" className="hidden dock-side:block dock-side:h-5 dock-side:pt-1" />;
}

/** FieldBubble, fetched the first time there is something to say. */
export function LazyFieldBubble(props: ComponentProps<typeof FieldBubble>) {
  // Fetched after hydration, so the first error shows without a wait.
  useEffect(() => void import("./FieldBubble").catch(() => {}), []);
  return props.error || props.hint ? <Bubble {...props} /> : <BubbleSlot />;
}
