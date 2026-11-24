import { describe, expect, it } from "vitest";
import { dropBelowEngine, minEngine, tail, createHistory, commit } from "./history";
import type { DocState } from "./model";
import { initialVersions, isPrefix, pushVersion, releaseBelow, versionBytes, versionsSize, type VersionEntry } from "./versions";

const bytes = (...n: number[]) => new Uint8Array(n);
const fill = (n: number, v: number) => new Uint8Array(n).fill(v);
const list = (v: VersionEntry[], i: number) => [...(versionBytes(v, i) ?? [])];

describe("engine byte versions", () => {
  it("keeps one copy for a chain of appended saves", () => {
    const a = bytes(1, 2, 3);
    const b = bytes(1, 2, 3, 4, 5);
    const c = bytes(1, 2, 3, 4, 5, 6);
    let v = initialVersions(a);
    v = pushVersion(v, 0, b, true).versions;
    v = pushVersion(v, 1, c, true).versions;
    expect(v).toEqual([{ length: 3 }, { length: 5 }, { bytes: c }]);
    expect(versionsSize(v)).toBe(6);
    expect(list(v, 0)).toEqual([1, 2, 3]);
    expect(list(v, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it("an edit after undo drops the redo branch and keeps earlier versions readable", () => {
    let v = initialVersions(bytes(1, 2));
    v = pushVersion(v, 0, bytes(1, 2, 3), true).versions;
    v = pushVersion(v, 1, bytes(1, 2, 3, 4), true).versions;
    // Undo to version 1, then a different edit.
    const r = pushVersion(v, 1, bytes(1, 2, 3, 9), true);
    expect(r.index).toBe(2);
    expect(list(r.versions, 0)).toEqual([1, 2]);
    expect(list(r.versions, 1)).toEqual([1, 2, 3]);
    expect(list(r.versions, 2)).toEqual([1, 2, 3, 9]);
    expect(versionsSize(r.versions)).toBe(4);
  });

  it("keeps rewrites as copies within a budget and reports the floor", () => {
    let v = initialVersions(fill(100, 1));
    let floor = 0;
    for (let i = 2; i <= 6; i++) ({ versions: v, floor } = pushVersion(v, v.length - 1, fill(100, i), false, 250));
    // Newest + at most 250 bytes of older copies.
    expect(versionsSize(v) - 100).toBeLessThanOrEqual(250);
    expect(floor).toBe(3);
    expect(versionBytes(v, 2)).toBeNull();
    expect(versionBytes(v, 3)?.[0]).toBe(4);
  });

  it("releases versions no state uses", () => {
    let v = initialVersions(fill(10, 1));
    v = pushVersion(v, 0, fill(20, 2), false).versions;
    v = pushVersion(v, 1, fill(30, 3), false).versions;
    expect(versionsSize(v)).toBe(60);
    v = releaseBelow(v, 2);
    expect(versionsSize(v)).toBe(30);
    expect(versionBytes(v, 0)).toBeNull();
  });

  it("isPrefix spots a rewrite", () => {
    expect(isPrefix(bytes(1, 2), bytes(1, 2, 3))).toBe(true);
    expect(isPrefix(bytes(1, 2), bytes(1, 3, 3))).toBe(false);
  });
});

describe("history trimmed with versions", () => {
  const doc = (engine: number): DocState => ({ pages: [], objects: [], engine });
  it("drops states whose bytes were released, and saves only a tail", () => {
    let h = createHistory(doc(0));
    for (let e = 1; e <= 4; e++) h = commit(h, doc(e), { label: `Edit ${e}`, at: e * 5000 });
    expect(minEngine(h)).toBe(0);
    const d = dropBelowEngine(h, 2);
    expect(d.states.map((s) => s.engine)).toEqual([2, 3, 4]);
    expect(d.entries.map((e) => e.label)).toEqual(["Edit 3", "Edit 4"]);
    expect(d.index).toBe(2);
    expect(tail(h, 2).states.map((s) => s.engine)).toEqual([2, 3, 4]);
  });
});
