import { describe, expect, it } from "vitest";
import { EXTRACT_PATTERN, SPLIT_PATTERN } from "@/lib/page-plans";
import { extractCopy } from "./extract/copy";
import { deleteCopy } from "./delete/copy";
import { splitCopy } from "./split/copy";
import { DEFAULT_PATTERN, initialSplit } from "./split/state";

/** The page tools keep the engine's defaults in light modules (first load, spec F4/F5 UI P-12). */
describe("F4 page-tool defaults and copy", () => {
  it("match the engine's name patterns", () => {
    expect(DEFAULT_PATTERN).toBe(SPLIT_PATTERN);
    expect(extractCopy.defaultPattern).toBe(EXTRACT_PATTERN);
    expect(initialSplit()).toEqual({ kind: "every", nText: "2", text: "", perFile: {}, differs: false });
  });
  it("states the outcome on the primary, singular and plural (AC-545, P-13)", () => {
    expect(splitCopy.primary(1)).toBe("Split into 1 file");
    expect(splitCopy.primary(1000)).toBe("Split into 1,000 files");
    expect(extractCopy.primary(1)).toBe("Extract 1 page");
    expect(extractCopy.primary(5)).toBe("Extract 5 pages");
    expect(deleteCopy.primary(1)).toBe("Delete 1 page");
    expect(deleteCopy.primary(3)).toBe("Delete 3 pages");
  });
  it("words the status and live messages (P-13)", () => {
    expect(splitCopy.status(12, 3)).toBe("12 pages · 3 files");
    expect(splitCopy.statusLeftOut(6, 12, 3)).toBe("6 of 12 pages in 3 files");
    expect(extractCopy.status(5, 12)).toBe("5 of 12 pages");
    expect(extractCopy.live(5, 12)).toBe("5 of 12 pages picked");
    expect(deleteCopy.status(9, 12)).toBe("9 of 12 pages kept");
    expect(deleteCopy.liveMarked(2, 11, 12)).toBe("Page 2 marked. 11 of 12 pages kept");
    expect(deleteCopy.liveKept(2)).toBe("Page 2 kept");
    expect(splitCopy.tile(5, 2, 3)).toBe("Page 5, part 2 of 3");
    expect(splitCopy.tileLeftOut(6)).toBe("Page 6, not in any part");
    expect(deleteCopy.tile(2)).toBe("Remove page 2");
    expect(extractCopy.tile(2, 12)).toBe("Page 2 of 12");
  });
});
