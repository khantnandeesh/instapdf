import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressPill, shortError, SlotError } from "./ActionSlot";
import { PrivacyNote, privacyText } from "./notes";
import { ordinal, slotCopy } from "./slot-copy";

const pill = (state: Parameters<typeof ProgressPill>[0]["state"], cancel = true) =>
  renderToStaticMarkup(createElement(ProgressPill, { state, action: "Delete pages", onCancel: cancel ? () => {} : undefined }));

describe("ProgressPill (F25 §6)", () => {
  it("is a group named after the action, holding a determinate progressbar while working", () => {
    const html = pill({ phase: "work", fraction: 0.42, verb: "Deleting" });
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Delete pages progress"');
    expect(html).toContain('data-progress="work"');
    expect(html).toContain("Deleting… 42%");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('data-testid="cancel"');
    expect(html).toContain('data-testid="pill-spinner"');
  });

  it("glides without a fraction and leaves the value out", () => {
    const html = pill({ phase: "work", verb: "Compressing" });
    expect(html).toContain("Compressing…");
    expect(html).toContain("ip-pill__bar--glide");
    expect(html).not.toContain("aria-valuenow");
  });

  it("uploading: a percentage and Keep this tab open", () => {
    const html = pill({ phase: "upload", fraction: 0.6, verb: "Compressing" });
    expect(html).toContain('data-progress="upload"');
    expect(html).toContain("Uploading… 60%");
    expect(html).toContain("Keep this tab open.");
  });

  it("queue: the position in place of the spinner, an ETA line and a value text", () => {
    const html = pill({ phase: "queue", position: 25, etaSeconds: 120, verb: "Compressing" });
    expect(html).toContain('data-testid="queue-position"');
    expect(html).toContain("#25");
    expect(html).toContain("in line");
    expect(html).toContain("About 2 min. Keep this tab open.");
    expect(html).toContain('aria-valuetext="25th in line, about 2 minutes"');
    expect(html).not.toContain('data-testid="pill-spinner"');
  });

  it("done: the tick, no Cancel, no progressbar", () => {
    const html = pill({ phase: "done", verb: "Deleting" });
    expect(html).toContain('data-progress="done"');
    expect(html).toContain("Done");
    expect(html).not.toContain('data-testid="cancel"');
    expect(html).not.toContain('role="progressbar"');
  });
});

describe("the slot's error", () => {
  it("keeps a short first sentence, else the generic line", () => {
    expect(shortError("This PDF is damaged. Repair it, then try again.")).toBe("This PDF is damaged.");
    expect(shortError("Something long went wrong while making the file you asked for.")).toBe(slotCopy.errorShort);
  });
  it("shows Try again and, when given, the fixing tool", () => {
    const html = renderToStaticMarkup(createElement(SlotError, { line: "This PDF is damaged.", onRetry: () => {}, fix: { label: "Repair", onClick: () => {} } }));
    expect(html).toContain('data-testid="process-error"');
    expect(html).toContain("Try again");
    expect(html).toContain('data-testid="process-fix"');
  });
});

describe("copy", () => {
  it("ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
  it("AC-603: the privacy line is honest per runtime", () => {
    expect(privacyText("client", "intro")).toBe("Your files stay on this device.");
    expect(privacyText("server", "intro")).toBe("Uploaded securely, deleted after 2 hours.");
    expect(privacyText("server", "result")).toBe("Deleted from our server in 2 hours.");
    expect(renderToStaticMarkup(createElement(PrivacyNote, { runtime: "server", context: "intro" }))).toContain("Uploaded securely, deleted after 2 hours.");
  });
});
