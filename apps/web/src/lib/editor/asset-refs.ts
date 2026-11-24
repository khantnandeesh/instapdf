/**
 * Which image assets are still in use. Pure, unit tested.
 *
 * An asset stays while a history state (so undo can bring it back), the placement being dropped,
 * the copy clipboard or an open dialog (`held`) refers to it; everything else is released, and
 * only the assets the current page set uses are sent to the build worker.
 */
import type { History } from "./history";
import type { EditorObject } from "./model";

/** The asset an object uses, if any. */
export function assetOf(o: EditorObject): string | null {
  if (o.kind === "image") return o.asset;
  if (o.kind === "signature" && o.sig.type === "image") return o.sig.asset;
  return null;
}

/** Assets the given objects use. */
export function assetsOf(objects: readonly EditorObject[]): Set<string> {
  const ids = new Set<string>();
  for (const o of objects) {
    const a = assetOf(o);
    if (a) ids.add(a);
  }
  return ids;
}

/** Every asset something still refers to. */
export function referencedAssets(input: {
  history: History;
  placement?: { asset?: string; sig?: { type: string; asset?: string } } | null;
  clip?: readonly EditorObject[] | null;
  held?: Iterable<string>;
}): Set<string> {
  const ids = new Set<string>();
  for (const s of input.history.states) for (const a of assetsOf(s.objects)) ids.add(a);
  const p = input.placement;
  if (p?.asset) ids.add(p.asset);
  if (p?.sig?.type === "image" && p.sig.asset) ids.add(p.sig.asset);
  for (const a of assetsOf(input.clip ?? [])) ids.add(a);
  for (const a of input.held ?? []) ids.add(a);
  return ids;
}
