import { describe, expect, it } from "vitest";
import { channelName, parseFromTool, parseFromWindow, parseWindowParams, screenIncoming, windowUrl, wrap } from "./protocol";

const REQ = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const OTHER = "00000000-0000-4000-8000-000000000000";
const pdf = (name = "a.pdf", size = 10) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

describe("parseFromWindow", () => {
  it("accepts each expected message on its own request", () => {
    expect(parseFromWindow(wrap("window", REQ, { t: "ready" }), REQ)).toEqual({ t: "ready" });
    expect(parseFromWindow(wrap("window", REQ, { t: "progress", id: "f1", name: "a.pdf", loaded: 5, total: 10 }), REQ)).toEqual({
      t: "progress",
      id: "f1",
      name: "a.pdf",
      loaded: 5,
      total: 10,
    });
    const file = pdf();
    const m = parseFromWindow(wrap("window", REQ, { t: "files", files: [{ id: "f1", file }] }), REQ);
    expect(m).toEqual({ t: "files", files: [{ id: "f1", file }] });
    expect(m && m.t === "files" && m.files[0].file).toBe(file); // by reference, no copy
    expect(parseFromWindow(wrap("window", REQ, { t: "skipped", items: [{ name: "big.pdf", reason: "size" }] }), REQ)).toEqual({ t: "skipped", items: [{ name: "big.pdf", reason: "size" }] });
    expect(parseFromWindow(wrap("window", REQ, { t: "error", code: "denied" }), REQ)).toEqual({ t: "error", code: "denied" });
    expect(parseFromWindow(wrap("window", REQ, { t: "away", ms: 120_000 }), REQ)).toEqual({ t: "away", ms: 120_000 });
    expect(parseFromWindow(wrap("window", REQ, { t: "saved", name: "a.pdf", link: "https://drive.google.com/x" }), REQ)).toEqual({ t: "saved", name: "a.pdf", link: "https://drive.google.com/x" });
  });

  it("drops another request's messages, the tool's own echoes and unknown types", () => {
    expect(parseFromWindow(wrap("window", OTHER, { t: "ready" }), REQ)).toBeNull();
    expect(parseFromWindow(wrap("tool", REQ, { t: "ack" }), REQ)).toBeNull();
    expect(parseFromWindow({ from: "window", req: REQ, t: "eval", code: "x" }, REQ)).toBeNull();
    expect(parseFromWindow(null, REQ)).toBeNull();
    expect(parseFromWindow("ready", REQ)).toBeNull();
    expect(parseFromWindow([], REQ)).toBeNull();
  });

  it("drops malformed fields: non-File files, bad numbers, odd ids, unknown codes, non-https links", () => {
    const bad = [
      { t: "files", files: [{ id: "f1", file: new Blob(["x"]) }] },
      { t: "files", files: [{ id: "f1", file: { name: "a.pdf", size: 1 } }] },
      { t: "files", files: [] },
      { t: "files", files: Array.from({ length: 201 }, (_, i) => ({ id: `f${i}`, file: pdf() })) },
      { t: "files", files: [{ id: "../x", file: pdf() }] },
      { t: "progress", id: "f1", name: "a.pdf", loaded: -1, total: 10 },
      { t: "progress", id: "f1", name: "a.pdf", loaded: Number.NaN, total: 10 },
      { t: "progress", id: "f1", name: "", loaded: 1, total: 10 },
      { t: "progress", id: "f1", name: "x".repeat(2000), loaded: 1, total: 10 },
      { t: "skipped", items: [{ name: "a.pdf", reason: "because" }] },
      { t: "error", code: "boom" },
      { t: "saved" },
      { t: "away", ms: 11 * 60_000 },
      { t: "away", ms: -1 },
    ];
    for (const m of bad) expect(parseFromWindow(wrap("window", REQ, m as never), REQ), JSON.stringify(m).slice(0, 80)).toBeNull();
    expect(parseFromWindow(wrap("window", REQ, { t: "saved", name: "a.pdf", link: "javascript:alert(1)" }), REQ)).toEqual({ t: "saved", name: "a.pdf", link: undefined });
  });
});

describe("parseFromTool", () => {
  it("accepts the tool's commands and a File to save, nothing else", () => {
    const f = pdf();
    expect(parseFromTool(wrap("tool", REQ, { t: "pong" }), REQ)).toEqual({ t: "pong" });
    expect(parseFromTool(wrap("tool", REQ, { t: "stop", id: "f2" }), REQ)).toEqual({ t: "stop", id: "f2" });
    expect(parseFromTool(wrap("tool", REQ, { t: "save", file: f }), REQ)).toEqual({ t: "save", file: f });
    expect(parseFromTool(wrap("tool", REQ, { t: "save", file: "a.pdf" } as never), REQ)).toBeNull();
    expect(parseFromTool(wrap("tool", OTHER, { t: "pong" }), REQ)).toBeNull();
    expect(parseFromTool(wrap("window", REQ, { t: "cancel" }), REQ)).toBeNull();
  });
});

describe("screenIncoming (the tool tab's own check)", () => {
  const accept = { mime: ["application/pdf"], extensions: [".pdf"] };
  it("skips wrong types and files over the tool's cap, keeps the rest in order", () => {
    const r = screenIncoming([pdf("a.pdf"), new File(["x"], "notes.txt", { type: "text/plain" }), pdf("big.pdf", 50), pdf("b.pdf")], { accept, maxFileBytes: 20, multiple: true });
    expect(r.accepted.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(r.skipped).toEqual([
      { name: "notes.txt", reason: "type" },
      { name: "big.pdf", reason: "size" },
    ]);
  });
  it("a single-file tool takes only the first file of the whole request", () => {
    expect(screenIncoming([pdf("a.pdf"), pdf("b.pdf")], { accept, maxFileBytes: 20, multiple: false }).accepted.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(screenIncoming([pdf("c.pdf")], { accept, maxFileBytes: 20, multiple: false }, 1).accepted).toEqual([]);
  });
});

describe("window URL", () => {
  it("round-trips the request", () => {
    const url = windowUrl("mock", { req: REQ, accept: [".pdf", ".png"], multiple: true, max: 104857600, tool: "Merge PDF", provider: "dropbox" });
    expect(url).toBe(`/cloud/mock?req=${REQ}&accept=.pdf%2C.png&multiple=1&max=104857600&tool=Merge+PDF&p=dropbox`);
    const parsed = parseWindowParams("mock", url.split("?")[1]);
    expect(parsed).toMatchObject({ route: "mock", req: REQ, accept: [".pdf", ".png"], multiple: true, max: 104857600, tool: "Merge PDF", provider: "dropbox", mode: "pick" });
    expect(parseWindowParams("google", `req=${REQ}&accept=.pdf&multiple=0&max=10&tool=Rotate&mode=save`)).toMatchObject({ provider: "google", mode: "save", multiple: false });
    expect(channelName(REQ)).toBe(`cloud:${REQ}`);
  });
  it("rejects anything malformed", () => {
    expect(parseWindowParams("google", "req=nope&accept=.pdf&max=10")).toBeNull();
    expect(parseWindowParams("google", `req=${REQ}&accept=pdf&max=10`)).toBeNull();
    expect(parseWindowParams("google", `req=${REQ}&accept=.pdf&max=-1`)).toBeNull();
    expect(parseWindowParams("box", `req=${REQ}&accept=.pdf&max=10`)).toBeNull();
    expect(parseWindowParams("mock", `req=${REQ}&accept=.pdf&max=10`)).toBeNull(); // mock needs p=
  });
});
