import { describe, expect, it } from "vitest";
import { visualOrder } from "./text";

describe("visualOrder (right-to-left runs in file names)", () => {
  it("leaves left-to-right text alone", () => {
    expect(visualOrder("alpha-2024 (final).pdf")).toBe("alpha-2024 (final).pdf");
  });
  it("reverses a multi-word Hebrew name, keeping the extension after it", () => {
    expect(visualOrder("דוח שנתי.pdf")).toBe("יתנש חוד.pdf");
    expect(visualOrder("דוח-שנתי_סופי.pdf")).toBe("יפוס_יתנש-חוד.pdf");
  });
  it("keeps numbers in order and puts them on the right-to-left side", () => {
    expect(visualOrder("דוח שנתי 2024.pdf")).toBe("2024 יתנש חוד.pdf");
    // A single "-", "." or "," between digits joins them into one number (Unicode bidi W4).
    expect(visualOrder("דוח 12-3 שנתי.pdf")).toBe("יתנש 12-3 חוד.pdf");
    expect(visualOrder("דוח 2024-01-05 סופי.pdf")).toBe("יפוס 2024-01-05 חוד.pdf");
    expect(visualOrder("מחיר 1,000 שקל")).toBe("לקש 1,000 ריחמ");
    expect(visualOrder("גרסה 3.5.pdf")).toBe("3.5 הסרג.pdf");
    // Two separators, or one with a space next to it, do not join: the groups are separate.
    expect(visualOrder("דוח 12--3 שנתי")).toBe("יתנש 3--12 חוד");
    expect(visualOrder("דוח 12 - 3 שנתי")).toBe("יתנש 3 - 12 חוד");
  });
  it("handles a name of digits and Hebrew only, and a lone Hebrew letter", () => {
    expect(visualOrder("א")).toBe("א");
    expect(visualOrder("2024 דוח")).toBe("2024 חוד");
    expect(visualOrder("דוח_")).toBe("חוד_");
  });
  it("mirrors brackets inside the run", () => {
    expect(visualOrder("דוח (טיוטה) שנתי.pdf")).toBe("יתנש (הטויט) חוד.pdf");
  });
  it("handles Latin text before and after", () => {
    expect(visualOrder("Q3 דוח שנתי v2.pdf")).toBe("Q3 יתנש חוד v2.pdf");
  });
});
