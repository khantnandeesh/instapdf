import { describe, expect, it } from "vitest";
import { packMenu } from "./menu-pack";

const cols = (rows: number[], k: number) => packMenu(rows, k).map((c) => [c.groups, c.span]);
// Today's groups: Organize 12, Edit & sign 16, Optimize 3, Security 2, Convert from 6, Convert to 3, Scans 2, Automate 1.
const today = [12, 16, 3, 2, 6, 3, 2, 1];

describe("packMenu (All tools panel, one column per group)", () => {
  it("never splits a group across columns; a tall group spans two side by side; order is kept", () => {
    expect(cols(today, 5)).toEqual([[[0], 1], [[1], 2], [[2, 3, 4], 1], [[5, 6, 7], 1]]);
    expect(cols(today, 4)).toEqual([[[0], 1], [[1], 1], [[2, 3, 4], 1], [[5, 6, 7], 1]]);
  });
  it("uses at most the columns it has", () => {
    for (let k = 1; k <= 8; k++) expect(packMenu(today, k).reduce((s, c) => s + c.span, 0)).toBeLessThanOrEqual(k);
    expect(cols(today, 1)).toEqual([[[0, 1, 2, 3, 4, 5, 6, 7], 1]]);
  });
  it("does not spread a short list thin (search results)", () => {
    expect(cols([3], 5)).toEqual([[[0], 1]]);
    expect(cols([1, 2], 5)).toEqual([[[0], 1], [[1], 1]]);
  });
});
