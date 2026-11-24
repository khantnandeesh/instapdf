import { describe, expect, it } from "vitest";
import { ACCEPTS_BR, ACCEPTS_GZIP } from "./accept-encoding";

const br = new RegExp(`^${ACCEPTS_BR}$`);
const gz = new RegExp(`^${ACCEPTS_GZIP}$`);

describe("Accept-Encoding patterns", () => {
  it("take a listed coding", () => {
    for (const h of ["gzip, deflate, br, zstd", "br", "br;q=1.0, gzip;q=0.8", "gzip,br", "br ; q=0.5"]) expect(br.test(h), h).toBe(true);
    for (const h of ["gzip, deflate, br, zstd", "gzip", "gzip;q=0.5", "deflate, gzip"]) expect(gz.test(h), h).toBe(true);
  });
  it("refuse a coding with q=0, and lookalikes", () => {
    for (const h of ["gzip, br;q=0", "br;q=0", "br; q=0.000, gzip", "gzip, deflate", "brotli", "x-br", ""]) expect(br.test(h), h).toBe(false);
    for (const h of ["gzip;q=0, br", "x-gzip", "br"]) expect(gz.test(h), h).toBe(false);
  });
  it("still takes a small q above zero", () => {
    expect(br.test("br;q=0.001")).toBe(true);
  });
});
