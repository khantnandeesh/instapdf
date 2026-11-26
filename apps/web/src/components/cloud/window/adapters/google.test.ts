import { describe, expect, it, vi } from "vitest";
import { onepickUrl, pickedFiles } from "./google";
import { CloudError } from "./types";

describe("onepickUrl", () => {
  it("asks Google for its own picker with drive.file only, back to the bare window URL", () => {
    const u = new URL(onepickUrl("cid.apps.googleusercontent.com", "https://berrypdf.test"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "cid.apps.googleusercontent.com",
      response_type: "token",
      scope: "https://www.googleapis.com/auth/drive.file",
      redirect_uri: "https://berrypdf.test/cloud/google",
      prompt: "consent",
      trigger_onepick: "true",
    });
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
      url: "https://www.googleapis.com/drive/v3/files/a1?alt=media",
      headers: { Authorization: "Bearer T0K" },
      name: "Report.pdf",
      type: "application/pdf",
      total: 2048,
    });
    // A Google document arrives exported as a PDF (AC-141).
    expect(d).toMatchObject({ id: "f2", name: "Plan.pdf", native: true });
    expect((await d!.request()).url).toBe("https://www.googleapis.com/drive/v3/files/d1/export?mimeType=application%2Fpdf");
    // A file Drive won't describe: a row that fails as "can't open", never a crash.
    expect(gone!.name).toBe("Google Drive file");
    await expect(gone!.request()).rejects.toEqual(new CloudError("denied"));
  });
});
