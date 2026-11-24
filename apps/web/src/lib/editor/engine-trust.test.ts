import { describe, expect, it } from "vitest";
import { MadeAfterTrust, fingerprint, type TrustedDocument } from "./engine-trust";

/** A document whose madeAfter starts at its highest object number. */
function doc(max: number): TrustedDocument & { value: number } {
  return {
    value: max,
    madeAfter() {
      return this.value;
    },
    setMadeAfter(n: number) {
      this.value = Math.min(n, max);
    },
  };
}

const bytes = (...b: number[]) => new Uint8Array(b);

/** The worker's sequence: open() restores, then an open request calls opened(). */
function openRequest(trust: MadeAfterTrust, b: Uint8Array, max: number) {
  const d = doc(max);
  trust.restore(fingerprint(b), d);
  trust.opened(fingerprint(b), d);
  return d;
}
function reopen(trust: MadeAfterTrust, b: Uint8Array, max: number) {
  const d = doc(max);
  trust.restore(fingerprint(b), d);
  return d;
}

describe("madeAfter trust in the engine worker", () => {
  it("restores the first open's boundary for outputs saved from it, also after an undo", () => {
    const trust = new MadeAfterTrust();
    const file = bytes(1, 2, 3);
    expect(openRequest(trust, file, 10).value).toBe(10);
    const one = bytes(1, 2, 3, 4);
    trust.saved(fingerprint(one));
    expect(reopen(trust, one, 14).value).toBe(10);
    const two = bytes(1, 2, 3, 4, 5);
    trust.saved(fingerprint(two));
    // Undo: the client opens an earlier output again; then another edit.
    expect(openRequest(trust, one, 14).value).toBe(10);
    const branch = bytes(1, 2, 3, 4, 6);
    trust.saved(fingerprint(branch));
    expect(reopen(trust, branch, 16).value).toBe(10);
    // The original bytes themselves keep the epoch too.
    expect(openRequest(trust, file, 10).value).toBe(10);
  });

  it("gives no trust to bytes it did not save, and starts a new epoch there", () => {
    const trust = new MadeAfterTrust();
    openRequest(trust, bytes(1, 2, 3), 10);
    trust.saved(fingerprint(bytes(1, 2, 3, 4)));
    // A file saved by another session (even one that starts with the same bytes).
    const other = bytes(1, 2, 3, 4, 9);
    expect(openRequest(trust, other, 20).value).toBe(20);
    // The old epoch's outputs are not trusted any more.
    expect(reopen(trust, bytes(1, 2, 3, 4), 14).value).toBe(14);
    // The new epoch's outputs are.
    const next = bytes(1, 2, 3, 4, 9, 1);
    trust.saved(fingerprint(next));
    expect(reopen(trust, next, 25).value).toBe(20);
  });

  it("trusts nothing before the first open", () => {
    const trust = new MadeAfterTrust();
    trust.saved(fingerprint(bytes(1)));
    expect(reopen(trust, bytes(1), 5).value).toBe(5);
  });

  it("fingerprints differ for different bytes of the same length", () => {
    expect(fingerprint(bytes(1, 2, 3))).not.toBe(fingerprint(bytes(3, 2, 1)));
    expect(fingerprint(bytes(0))).not.toBe(fingerprint(bytes(0, 0)));
  });
});
