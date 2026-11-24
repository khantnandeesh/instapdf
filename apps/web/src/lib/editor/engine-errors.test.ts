import { describe, expect, it } from "vitest";
import type { VerifyReason, SaveReason } from "./berry-engine";
import { describeEngineError, engineErrorLog, offersLineReplacement, type EngineError } from "./engine-client";

const request = { families: ["CMU Serif"], bold: false, italic: false };

describe("describeEngineError", () => {
  const cases: [EngineError, string][] = [
    [{ kind: "parse", message: "xref" }, "This file couldn’t be read as a PDF."],
    [{ kind: "encrypted" }, "Password-protected PDFs aren’t supported in the beta yet."],
    [{ kind: "bad-page" }, "Something went wrong. Please try again."],
    [{ kind: "bad-line" }, "Something went wrong. Please try again."],
    [{ kind: "bad-font" }, "Something went wrong. Please try again."],
    [{ kind: "read-only", reason: "vertical-text" }, "This line can’t be edited yet."],
    [{ kind: "unsupported", reason: "undecodable-content" }, "This line can’t be edited yet."],
    [{ kind: "missing-glyphs", chars: "₹", request }, "This font has no “₹”."],
    [{ kind: "missing-glyphs", chars: "₹Q₹", request }, "This font has no “₹” “Q”."],
    [{ kind: "verify", reason: "overflow", message: "m" }, "The edited line would run past the page edge."],
    [{ kind: "verify", reason: "overlap", message: "m" }, "The edited line would run into the text next to it."],
    [{ kind: "save", reason: "reparse-failed", message: "m" }, "Saving this edit failed, so the line is unchanged. Please try again."],
    [{ kind: "crashed" }, "The editor restarted. Please try that again."],
    [{ kind: "aborted" }, "The editor restarted. Please try that again."],
    [{ kind: "internal", message: "No document" }, "Something went wrong. Please try again."],
  ];
  it.each(cases)("%o", (e, text) => {
    expect(describeEngineError(e)).toBe(text);
  });

  const unknown = "We couldn’t apply this edit safely, so the line is unchanged. Try a shorter change, or replace the line with new text.";
  it.each<VerifyReason>(["text-mismatch", "position-drift", "glyph-mismatch"])("verify %s gets the safe fallback message", (reason) => {
    expect(describeEngineError({ kind: "verify", reason, message: "the line reads \"secret\"" })).toBe(unknown);
  });

  it("never shows the old catch-all", () => {
    for (const [e] of cases) expect(describeEngineError(e)).not.toMatch(/pass our checks/);
  });
});

describe("offersLineReplacement", () => {
  it("is offered for every verify reason, and nothing else", () => {
    for (const reason of ["text-mismatch", "position-drift", "glyph-mismatch", "overflow", "overlap"] as VerifyReason[]) {
      expect(offersLineReplacement({ kind: "verify", reason, message: "" })).toBe(true);
    }
    expect(offersLineReplacement({ kind: "save", reason: "write-failed", message: "" })).toBe(false);
    expect(offersLineReplacement({ kind: "missing-glyphs", chars: "₹", request })).toBe(false);
    expect(offersLineReplacement({ kind: "read-only", reason: "needs-shaping" })).toBe(false);
  });
});

describe("engineErrorLog", () => {
  it("logs the kind and reason code, never the engine's message (it can quote the file)", () => {
    const log = engineErrorLog({ kind: "verify", reason: "text-mismatch", message: "the line reads \"Salary 90,000\"" });
    expect(log).toBe("[editor] edit not applied: verify/text-mismatch");
    expect(log).not.toContain("Salary");
    for (const reason of ["write-failed", "object-mismatch"] as SaveReason[]) {
      expect(engineErrorLog({ kind: "save", reason, message: "object 4 0" })).toBe(`[editor] edit not applied: save/${reason}`);
    }
    expect(engineErrorLog({ kind: "missing-glyphs", chars: "₹", request })).toBe("[editor] edit not applied: missing-glyphs");
  });
});
