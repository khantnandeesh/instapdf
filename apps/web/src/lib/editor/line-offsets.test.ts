import { describe, expect, it } from "vitest";
import { textOffsets } from "./line-offsets";

describe("textOffsets", () => {
  it("finds words after a ligature the engine counted as one character", () => {
    const text = "The meeting moves to Friday";
    // As the engine reports them: "meeting" holds a "ti" ligature, so it ends at 10, not 11.
    const words = [{ text: "The" }, { text: "meeting" }, { text: "moves" }, { text: "to" }, { text: "Friday" }];
    expect(textOffsets(text, words)).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 11 },
      { start: 12, end: 17 },
      { start: 18, end: 20 },
      { start: 21, end: 27 },
    ]);
  });

  it("takes repeated words in order", () => {
    expect(textOffsets(". . .", [{ text: "." }, { text: "." }, { text: "." }])).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ]);
  });

  it("places runs that follow each other without a gap", () => {
    expect(textOffsets("Normal bold and", [{ text: "Normal " }, { text: "bold " }, { text: "and" }])).toEqual([
      { start: 0, end: 7 },
      { start: 7, end: 12 },
      { start: 12, end: 15 },
    ]);
  });

  it("gives up when a part is not in the text", () => {
    expect(textOffsets("abc", [{ text: "abd" }])).toBeNull();
  });
});
