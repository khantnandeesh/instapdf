/**
 * Loads the motion engine (GSAP core + Flip, ~38 kB gzip) as its own lazy chunk. Never part of a
 * route's first load: components/site/MotionPrime calls primeMotion() after hydration, on the first
 * sign of intent or when idle (docs/design/motion.md §2, rule 2). Until it has arrived, lib/motion
 * falls back to instant. Only MotionPrime imports this file, so the import() lives in one chunk.
 */
import { setMotion } from "./state";

let loading: Promise<unknown> | undefined;

/** Starts the engine download (idempotent; a failed download is retried on the next call). */
export function primeMotion(): void {
  loading ??= import("./engine").then(setMotion, () => (loading = undefined));
}
