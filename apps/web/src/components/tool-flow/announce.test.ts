import { describe, expect, it } from "vitest";
import { announcementFor, freshMemo, PROGRESS_EVERY_MS, QUEUE_EVERY_MS, throttleAnnouncement } from "./announce";

describe("throttleAnnouncement (F25 §6 screen readers)", () => {
  it("says every phase change at once", () => {
    let m = freshMemo();
    const r1 = throttleAnnouncement(m, { phase: "upload", fraction: 0 }, 0);
    expect(r1.say).toEqual({ kind: "phase" });
    m = r1.memo;
    const r2 = throttleAnnouncement(m, { phase: "queue", position: 9 }, 50);
    expect(r2.say).toEqual({ kind: "phase" });
    const r3 = throttleAnnouncement(r2.memo, { phase: "work", fraction: 0 }, 60);
    expect(r3.say).toEqual({ kind: "phase" });
  });

  it("says progress only when a 25/50/75 mark is crossed, at most once per 10s", () => {
    let m = throttleAnnouncement(freshMemo(), { phase: "work", fraction: 0 }, 0).memo;
    let r = throttleAnnouncement(m, { phase: "work", fraction: 0.3 }, 1000);
    expect(r.say).toBeNull(); // crossed 25 but under 10s
    r = throttleAnnouncement(r.memo, { phase: "work", fraction: 0.3 }, PROGRESS_EVERY_MS);
    expect(r.say).toEqual({ kind: "progress", percent: 25 });
    m = r.memo;
    r = throttleAnnouncement(m, { phase: "work", fraction: 0.4 }, PROGRESS_EVERY_MS * 3);
    expect(r.say).toBeNull(); // no new mark
    r = throttleAnnouncement(m, { phase: "work", fraction: 0.8 }, PROGRESS_EVERY_MS * 3);
    expect(r.say).toEqual({ kind: "progress", percent: 75 }); // the highest mark crossed
  });

  it("says the queue position at most every 30s, and at once when it reaches 1", () => {
    let r = throttleAnnouncement(freshMemo(), { phase: "queue", position: 25 }, 0);
    r = throttleAnnouncement(r.memo, { phase: "queue", position: 20 }, 5000);
    expect(r.say).toBeNull();
    r = throttleAnnouncement(r.memo, { phase: "queue", position: 18 }, QUEUE_EVERY_MS);
    expect(r.say).toEqual({ kind: "queue", position: 18 });
    r = throttleAnnouncement(r.memo, { phase: "queue", position: 1 }, QUEUE_EVERY_MS + 10);
    expect(r.say).toEqual({ kind: "queue", position: 1 });
  });
});

describe("announcementFor", () => {
  it("words each kind of report", () => {
    expect(announcementFor(null, { phase: "work", fraction: 0.1 }, 0, "Deleting").text).toBeNull(); // the run start said it
    expect(announcementFor(null, { phase: "work", fraction: 0.55 }, 0, "Deleting").text).toBe("Deleting 50%");
    expect(announcementFor(null, { phase: "upload", fraction: 0 }, 0, "Deleting").text).toBe("Uploading");
    expect(announcementFor(null, { phase: "queue", position: 3, etaSeconds: 120 }, 0, "Deleting").text).toBe("3rd in line");
    expect(announcementFor(null, { phase: "queue" }, 0, "Deleting").text).toBe("in line");
  });
});
