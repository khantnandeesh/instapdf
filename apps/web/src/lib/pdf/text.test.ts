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
  it("keeps digit groups in order and puts them on the right-to-left side", () => {
    expect(visualOrder("דוח שנתי 2024.pdf")).toBe("2024 יתנש חוד.pdf");
    expect(visualOrder("דוח 12-3 שנתי.pdf")).toBe("יתנש 3-12 חוד.pdf");
  });
  it("mirrors brackets inside the run", () => {
    expect(visualOrder("דוח (טיוטה) שנתי.pdf")).toBe("יתנש (הטויט) חוד.pdf");
  });
  it("handles Latin text before and after", () => {
    expect(visualOrder("Q3 דוח שנתי v2.pdf")).toBe("Q3 יתנש חוד v2.pdf");
  });
});
