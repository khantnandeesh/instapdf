import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isOwnerPassword } from "./owner";

const fixture = new Uint8Array(readFileSync(new URL("../../../tests/fixtures/owner-restricted.pdf", import.meta.url)));

describe("isOwnerPassword", () => {
  it("accepts the owner password and nothing else", async () => {
    expect(await isOwnerPassword(fixture, "owner123")).toBe(true);
    expect(await isOwnerPassword(fixture, "owner124")).toBe(false);
    expect(await isOwnerPassword(fixture, "")).toBe(false);
  });
});
