/**
 * F23 mock provider files (CI/e2e only): serves a few tests/fixtures files same-origin to the
 * /cloud/mock window. 404 unless the mock is active (never in a production build without
 * NEXT_PUBLIC_CLOUD_MOCK=1). `slow=1` streams in small timed chunks, `fail=1` breaks off half way,
 * `status=403` refuses, `size=1` answers the byte size (what a real picker reports up front).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mockActive } from "@/lib/cloud/providers";

const FILES = new Set(["alpha.pdf", "bravo.pdf", "echo.pdf", "charlie.png", "notes.txt", "user-pw.pdf", "corrupt.pdf", "three-pages.pdf"]);

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!mockActive() || !FILES.has(name)) return new Response("Not found", { status: 404 });
  const q = new URL(request.url).searchParams;
  // A refusal; `reason` answers in Google's JSON error shape.
  if (q.get("status") === "403") {
    const reason = q.get("reason");
    return reason ? Response.json({ error: { code: 403, errors: [{ reason }] } }, { status: 403 }) : new Response("Forbidden", { status: 403 });
  }
  const bytes = new Uint8Array(await readFile(join(process.cwd(), "tests", "fixtures", name)));
  if (q.get("size") === "1") return new Response(String(bytes.length), { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  const type = name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".png") ? "image/png" : "text/plain";
  const slow = q.get("slow") === "1";
  const fail = q.get("fail") === "1";
  const chunk = slow ? Math.max(64, Math.ceil(bytes.length / 8)) : bytes.length;
  let at = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(c) {
      if (fail && at >= bytes.length / 2) return c.error(new Error("mock: connection reset"));
      if (at >= bytes.length) return c.close();
      if (slow) await new Promise((r) => setTimeout(r, 350));
      const end = Math.min(bytes.length, at + (fail ? Math.ceil(bytes.length / 2) : chunk));
      c.enqueue(bytes.slice(at, end));
      at = end;
    },
  });
  return new Response(body, { headers: { "Content-Type": type, "Content-Length": String(bytes.length), "Cache-Control": "no-store" } });
}
