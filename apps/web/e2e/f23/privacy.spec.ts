/** F23 privacy checks with the mock provider: what reaches our origin, what is stored. Spec: AC-125, AC-126, AC-128, AC-129 */
import { expect, test } from "@playwright/test";
import { openMerge, runAndDownload } from "../f3/support";
import { caret, fixtureBytes, needsCloud, openWindow, mockPick, recordRequests } from "./support";

needsCloud();

test("AC-125, AC-126, AC-128, AC-129: a full mock merge sends nothing but GETs to our origin, and no token anywhere", async ({ page, context }) => {
  page.on("dialog", (d) => void d.accept());
  const seen = recordRequests(context);
  await openMerge(page);
  const origin = new URL(page.url()).origin;
  // AC-125: until a provider is chosen, nothing goes anywhere but our origin.
  await page.waitForLoadState("networkidle");
  expect(seen.filter((r) => !r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")).map((r) => r.url())).toEqual([]);
  const foreignScripts = () => page.evaluate(() => [...document.scripts].filter((s) => s.src && new URL(s.src).origin !== location.origin).map((s) => s.src));
  expect(await foreignScripts()).toEqual([]);
  await caret(page).click();
  expect(await foreignScripts()).toEqual([]);
  const win = await openWindow(page, () => page.getByRole("menuitem", { name: /^Google Drive/ }).click());
  expect(await foreignScripts()).toEqual([]);
  await mockPick(win, ["alpha.pdf", "bravo.pdf"]);
  await expect.poll(() => page.getByTestId("file-name").allTextContents()).toEqual(["alpha.pdf", "bravo.pdf"]);
  expect(await foreignScripts()).toEqual([]);
  await runAndDownload(page);
  expect(await foreignScripts()).toEqual([]);

  // AC-126: only GETs to our origin; no token, no fixture bytes in what we sent.
  const ours = seen.filter((r) => r.url().startsWith(origin));
  expect(ours.filter((r) => r.method() !== "GET").map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  const alphaHead = Buffer.from(await fixtureBytes("alpha.pdf")).subarray(200, 264).toString("latin1");
  for (const r of ours) {
    const sent = `${r.url()} ${JSON.stringify(r.headers())} ${r.postData() ?? ""}`;
    expect(sent).not.toContain("MOCK-TOKEN-F23");
    expect(sent).not.toContain(alphaHead);
  }
  // AC-129: nothing stored holds the token, after a reload too.
  await page.reload();
  const stored = await page.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? [];
    return JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie, dbs });
  });
  expect(stored).not.toContain("MOCK-TOKEN-F23");
  expect(await page.evaluate(() => localStorage.getItem("berrypdf:cloud-last"))).toBe("google");
});
