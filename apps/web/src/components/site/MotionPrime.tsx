"use client";
/**
 * Fetches the motion engine (lib/motion, a lazy chunk) after hydration: on the first pointer, key, focus
 * or drag, or after 4s, and then only when the browser is idle (docs/design/motion.md §2, rule 2). The
 * chunk is on its way while the visitor reaches for the file picker; a phone that only reads the page
 * doesn't fetch it in the first 4s. Until it arrives, every motion call completes at once.
 */
import { useEffect } from "react";
import { primeMotion } from "@/lib/motion/load";
import { onIntent } from "../tool-flow/intent";

export function MotionPrime() {
  useEffect(() => onIntent(() => ("requestIdleCallback" in window ? requestIdleCallback(primeMotion) : setTimeout(primeMotion))), []);
  return null;
}
