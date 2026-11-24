import { describe, expect, it } from "vitest";
import { exportName, exportUrl, isNative, nativeMimes } from "./native";
import { isSignInResponse } from "./types";

describe("Google documents (AC-141)", () => {
  it("are offered only where the tool takes PDFs, and arrive as <name>.pdf from the export endpoint", () => {
    expect(nativeMimes([".pdf"])).toEqual(["application/vnd.google-apps.document", "application/vnd.google-apps.spreadsheet", "application/vnd.google-apps.presentation"]);
    expect(nativeMimes([".png", ".jpg"])).toEqual([]);
    expect(isNative("application/vnd.google-apps.document")).toBe(true);
    expect(isNative("application/pdf")).toBe(false);
    expect(isNative(undefined)).toBe(false);
    expect(exportName("Plan")).toBe("Plan.pdf");
    expect(exportName("report.PDF")).toBe("report.PDF");
    expect(exportUrl("a b")).toBe("https://www.googleapis.com/drive/v3/files/a%20b/export?mimeType=application%2Fpdf");
  });
});

describe("isSignInResponse", () => {
  it("spots an OAuth response on the bare redirect URL, in the hash or the query", () => {
    expect(isSignInResponse("#code=abc&state=xyz", "")).toBe(true);
    expect(isSignInResponse("", "?error=access_denied&state=xyz")).toBe(true);
    expect(isSignInResponse("#code=abc", "")).toBe(false);
    expect(isSignInResponse("", "?req=6f1c2a8e-3b4d-4e5f-8a9b-000000000001&accept=.pdf")).toBe(false);
  });
});
