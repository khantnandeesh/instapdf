import { describe, expect, it } from "vitest";
import { commit, createHistory, type History } from "./history";
import type { DocState, EditorObject } from "./model";
import { planSession, planSignature, restoreVersions, SAVED_STEPS, type SignatureLike } from "./persist-plan";
import { initialVersions, pushVersion, versionBytes, type VersionEntry } from "./versions";

const img = (id: string, asset: string): EditorObject => ({ kind: "image", id, page: "p0", x: 0, y: 0, w: 10, h: 10, rot: 0, asset, opacity: 1 });
const doc = (engine: number, objects: EditorObject[] = []): DocState => ({ pages: [], objects, engine });

function keyer() {
  const m = new WeakMap<Uint8Array, string>();
  let n = 0;
  return (b: Uint8Array) => {
    let k = m.get(b);
    if (!k) m.set(b, (k = `k${n++}`));
    return k;
  };
}

describe("planSession", () => {
  it("writes each blob once, and drops blobs nothing refers to", () => {
    const original = new Uint8Array(100).fill(1);
    let v: VersionEntry[] = initialVersions(original);
    v = pushVersion(v, 0, new Uint8Array(150).fill(1), true).versions;
    let h: History = createHistory(doc(0));
    h = commit(h, doc(1, [img("a", "imgA")]), { label: "Edit", at: 1 });
    const assets = { imgA: { bytes: new Uint8Array(40), mime: "image/png" as const }, unused: { bytes: new Uint8Array(4000), mime: "image/png" as const } };
    const keyOf = keyer();
    const first = planSession({ hash: "h", name: "f.pdf", history: h, versions: v, assets, written: new Set(), keyOf })!;
    // Version 0 is a length into version 1; only version 1 and the used image are blobs.
    expect(first.record.versions[0]).toEqual({ length: 100 });
    expect(first.put.map(([k]) => k).sort()).toEqual(["h/a/imgA", "h/v/k0"]);
    expect(first.size).toBe(190);
    // Nothing changed: nothing to write again.
    const again = planSession({ hash: "h", name: "f.pdf", history: h, versions: v, assets, written: new Set(first.put.map(([k]) => k)), keyOf })!;
    expect(again.put).toEqual([]);
    // The image is deleted from every kept state: its blob goes.
    const h2 = commit(h, doc(1), { label: "Delete", at: 5000 });
    const h3 = { ...h2, states: h2.states.slice(2), entries: h2.entries.slice(2), index: 0 };
    const third = planSession({ hash: "h", name: "f.pdf", history: h3, versions: v, assets, written: new Set(first.put.map(([k]) => k)), keyOf })!;
    expect(third.drop).toEqual(["h/a/imgA"]);
  });

  it("keeps at most the last steps, and leaves out older ones to fit the cap", () => {
    let h: History = createHistory(doc(0));
    for (let i = 0; i < SAVED_STEPS + 20; i++) h = commit(h, doc(0, [img(`o${i}`, `a${i}`)]), { label: "Add", at: i * 5000 });
    const assets = Object.fromEntries(Array.from({ length: SAVED_STEPS + 20 }, (_, i) => [`a${i}`, { bytes: new Uint8Array(0), mime: "image/png" as const }]));
    const p = planSession({ hash: "h", name: "f", history: h, versions: initialVersions(new Uint8Array(10)), assets, written: new Set(), keyOf: keyer() })!;
    expect(p.record.history.index).toBe(SAVED_STEPS);
    // A file whose newest version alone is over the cap is not kept.
    let v: VersionEntry[] = initialVersions(new Uint8Array(10));
    v = pushVersion(v, 0, new Uint8Array(500), false).versions;
    const big = commit(createHistory(doc(0)), doc(1), { label: "Edit text", at: 1 });
    expect(planSession({ hash: "h", name: "f", history: big, versions: v, assets: {}, written: new Set(), keyOf: keyer(), cap: 100 })).toBeNull();
  });

  it("restores versions from the record and the reopened file", () => {
    const original = new Uint8Array([1, 2, 3]);
    let v: VersionEntry[] = initialVersions(original);
    v = pushVersion(v, 0, new Uint8Array([1, 2, 3, 4]), true).versions;
    v = pushVersion(v, 1, new Uint8Array([9, 9]), false).versions;
    let h: History = createHistory(doc(0));
    h = commit(h, doc(1), { label: "Edit text", at: 1 });
    h = commit(h, doc(2), { label: "Edit text", at: 5000 });
    const p = planSession({ hash: "h", name: "f", history: h, versions: v, assets: {}, written: new Set(), keyOf: keyer() })!;
    const blobs = new Map(p.put.map(([k, b]) => [k, b as Uint8Array]));
    const back = restoreVersions(p.record, original, blobs)!;
    expect([...versionBytes(back, 0)!]).toEqual([1, 2, 3]);
    expect([...versionBytes(back, 1)!]).toEqual([1, 2, 3, 4]);
    expect([...versionBytes(back, 2)!]).toEqual([9, 9]);
  });
});

describe("planSignature", () => {
  const sig = (id: string, text: string, at: number, role: SignatureLike["role"] = "signature"): SignatureLike => ({ id, role, sig: { type: "typed", text, face: "caveat" }, color: "#000000", at });
  it("reuses an identical saved signature instead of adding a copy", () => {
    const all = [sig("a", "Asha", 1)];
    const r = planSignature(all, sig("b", "Asha", 9));
    expect(r.put.id).toBe("a");
    expect(r.put.at).toBe(9);
    expect(r.drop).toEqual([]);
  });
  it("keeps the newest 5 per role", () => {
    const all = [1, 2, 3, 4, 5].map((i) => sig(`s${i}`, `N${i}`, i));
    const initials = sig("i1", "AR", 0, "initials");
    const r = planSignature([...all, initials], sig("s6", "N6", 6));
    expect(r.drop).toEqual(["s1"]);
  });
});
