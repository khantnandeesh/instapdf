import { describe, expect, it } from "vitest";
import { assetsOf, referencedAssets } from "./asset-refs";
import { commit, createHistory } from "./history";
import type { DocState, EditorObject } from "./model";

const img = (id: string, asset: string): EditorObject => ({ kind: "image", id, page: "p0", x: 0, y: 0, w: 10, h: 10, rot: 0, asset, opacity: 1 });
const sig = (id: string, asset: string): EditorObject =>
  ({ kind: "signature", id, page: "p0", x: 0, y: 0, w: 10, h: 4, rot: 0, role: "signature", color: "#000000", sig: { type: "image", asset } }) as unknown as EditorObject;
const doc = (objects: EditorObject[]): DocState => ({ pages: [], objects, engine: 0 });

describe("referencedAssets", () => {
  it("keeps assets any history state, the placement, the clipboard or a dialog uses", () => {
    let h = createHistory(doc([]));
    h = commit(h, doc([img("a", "A")]), { label: "Add", at: 1 });
    h = commit(h, doc([]), { label: "Delete", at: 5000 }); // A is still reachable by undo
    const refs = referencedAssets({ history: h, placement: { asset: "P" }, clip: [sig("c", "C")], held: ["U"] });
    expect([...refs].sort()).toEqual(["A", "C", "P", "U"]);
  });
  it("drops an asset once no state can bring it back", () => {
    // Remove-background toggled twice: only the last upload is held; the first two are unused.
    const h = createHistory(doc([]));
    const refs = referencedAssets({ history: h, held: ["upload3"] });
    expect(["upload1", "upload2"].filter((id) => !refs.has(id))).toEqual(["upload1", "upload2"]);
  });
  it("lists only the current objects' assets for a download", () => {
    expect([...assetsOf([img("a", "A"), sig("s", "S"), img("b", "A")])].sort()).toEqual(["A", "S"]);
  });
});
