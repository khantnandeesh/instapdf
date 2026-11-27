import { describe, expect, it } from "vitest";
import { formatCount } from "./format-count";

describe("formatCount", () => {
  it("groups whole numbers as toLocaleString('en') does", () => {
    for (const v of [0, 7, 42, 999, 1000, 1234, 12345, 123456, 1234567, 990, 1000000, -1, -1234, -1234567]) expect(formatCount(v)).toBe(v.toLocaleString("en"));
  });
  it("leaves fractions to the browser", () => {
    expect(formatCount(1234.5)).toBe((1234.5).toLocaleString("en"));
  });
});
