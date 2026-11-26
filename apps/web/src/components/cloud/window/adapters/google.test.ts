import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdapter, onepickParams, onepickUrl, pickedFiles } from "./google";
import * as onepick from "./onepick";
import type { AdapterCtx } from "./types";
import { CloudError } from "./types";

vi.mock("./onepick", () => ({ take: vi.fn(), hasPending: vi.fn(() => true), start: vi.fn() }));

describe("onepickUrl", () => {
  const PDF_MULTI = { multiple: true, accept: [".pdf"] };
  const NATIVE = "application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation";

  it("asks Google for its own picker with drive.file only, back to the bare window URL", () => {
    const u = new URL(onepickUrl("cid.apps.googleusercontent.com", "https://berrypdf.test", PDF_MULTI));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "cid.apps.googleusercontent.com",
      response_type: "token",
      scope: "https://www.googleapis.com/auth/drive.file",
      redirect_uri: "https://berrypdf.test/cloud/google",
      prompt: "consent",
      trigger_onepick: "true",
      allow_multiple: "true",
      mimetypes: `application/pdf,${NATIVE}`,
    });
  });

  it("filters to the tool's types and allows several files only where the tool takes them", () => {
    // Merge, Rotate…: several PDFs (and Google documents, exported as PDF).
    expect(onepickParams(PDF_MULTI)).toEqual({ allow_multiple: "true", mimetypes: `application/pdf,${NATIVE}` });
    // A single-file PDF tool (the editor, Split…): a single-select picker.
    expect(onepickParams({ multiple: false, accept: [".pdf"] })).toEqual({ mimetypes: `application/pdf,${NATIVE}` });
    // An image tool: image types only, no Google documents; .jpg and .jpeg share one type.
    expect(onepickParams({ multiple: true, accept: [".jpg", ".jpeg", ".png", ".tif", ".tiff"] })).toEqual({
      allow_multiple: "true",
      mimetypes: "image/jpeg,image/png,image/tiff",
    });
    // An extension with no known type: no filter at all, so nothing the tool takes is hidden.
    expect(onepickParams({ multiple: false, accept: [".xyz"] })).toEqual({});
    expect(onepickParams({ multiple: true, accept: [".pdf", ".docx"] })).toEqual({ allow_multiple: "true" });
    expect(new URL(onepickUrl("c", "https://b.test", { multiple: false, accept: [".pdf"] })).searchParams.has("allow_multiple")).toBe(false);
  });
});

describe("pickedFiles", () => {
  const meta: Record<string, unknown> = {
    a1: { id: "a1", name: "Report.pdf", mimeType: "application/pdf", size: "2048" },
    d1: { id: "d1", name: "Plan", mimeType: "application/vnd.google-apps.document" },
  };
  const get = vi.fn(async (url: string | URL | Request) => {
    const id = decodeURIComponent(String(url).split("/files/")[1]!.split("?")[0]!);
    return meta[id] ? new Response(JSON.stringify(meta[id]), { status: 200 }) : new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;

  it("names, sizes and downloads each picked file in this window, with the token as a header", async () => {
    const [f, d, gone] = await pickedFiles("T0K", ["a1", "d1", "zz"], get);
    expect(f).toMatchObject({ id: "f1", name: "Report.pdf", size: 2048 });
    expect(await f!.request()).toEqual({
      url: "https://www.googleapis.com/drive/v3/files/a1?alt=media&supportsAllDrives=true",
      headers: { Authorization: "Bearer T0K" },
      name: "Report.pdf",
      type: "application/pdf",
      total: 2048,
    });
    // Metadata is asked for with supportsAllDrives, so shared-drive files are found.
    expect(vi.mocked(get).mock.calls.map(([u]) => String(u))).toContain("https://www.googleapis.com/drive/v3/files/a1?fields=id,name,mimeType,size&supportsAllDrives=true");
    // A Google document arrives exported as a PDF (AC-141).
    expect(d).toMatchObject({ id: "f2", name: "Plan.pdf", native: true });
    expect((await d!.request()).url).toBe("https://www.googleapis.com/drive/v3/files/d1/export?mimeType=application%2Fpdf");
    // A file Drive won't describe: a row that fails as "can't open", never a crash.
    expect(gone!.name).toBe("Google Drive file");
    await expect(gone!.request()).rejects.toEqual(new CloudError("denied"));
  });
});

describe("createAdapter: back from Google's picker", () => {
  const ctx = (multiple: boolean) =>
    ({ params: { multiple, accept: [".pdf"], mode: "pick" }, setPhase: vi.fn(), frame: vi.fn(), leaving: vi.fn() }) as unknown as AdapterCtx;
  const fetched: string[] = [];
  beforeEach(() => {
    fetched.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetched.push(url);
        const id = url.split("/files/")[1]!.split("?")[0]!;
        return new Response(JSON.stringify({ id, name: `${id}.pdf`, mimeType: "application/pdf", size: "10" }), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a single-file tool looks up only the first picked file; a multi-file tool all of them", async () => {
    vi.mocked(onepick.take).mockReturnValueOnce({ kind: "picked", token: "T", ids: ["a1", "b2"], expiresIn: 3599 });
    expect((await createAdapter(ctx(false)).pick()) as unknown[]).toHaveLength(1);
    expect(fetched).toEqual([expect.stringContaining("/files/a1?")]);
    vi.mocked(onepick.take).mockReturnValueOnce({ kind: "picked", token: "T", ids: ["a1", "b2"], expiresIn: 3599 });
    expect((await createAdapter(ctx(true)).pick()) as unknown[]).toHaveLength(2);
  });

  it("the picker closed (access_denied) or nothing picked is a cancel; a bad state never uses its token", async () => {
    vi.mocked(onepick.take).mockReturnValueOnce({ kind: "denied" });
    expect(await createAdapter(ctx(true)).pick()).toBe("cancel");
    vi.mocked(onepick.take).mockReturnValueOnce({ kind: "empty" });
    expect(await createAdapter(ctx(true)).pick()).toBe("cancel");
    vi.mocked(onepick.take).mockReturnValueOnce({ kind: "invalid" });
    await expect(createAdapter(ctx(true)).pick()).rejects.toEqual(new CloudError("unreachable"));
    expect(fetched).toEqual([]);
  });
});
