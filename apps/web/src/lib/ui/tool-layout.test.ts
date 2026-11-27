/**
 * F25 grep tests: the old layout is gone (AC-606, AC-657), the e2e hooks that §8 keeps still exist
 * (AC-652), and the dock variants match the new places (dock-bar: row and bar; dock-side: the settings panel).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = join(__dirname, "..", "..");
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const all = files(src).map((p) => ({ p, text: readFileSync(p, "utf8") }));
const read = (rel: string) => readFileSync(join(src, rel), "utf8");

describe("F25 layout grep tests", () => {
  it("AC-606: the editor's landing is ToolIntro + DropCard, with no markup of its own", () => {
    const t = read("tools/editor/EditorTool.tsx");
    expect(t).toMatch(/<ToolIntro\b/);
    expect(t).toMatch(/<DropCard\b/);
    expect(t).not.toMatch(/mp-empty|mp-dropcard/);
  });

  it("AC-657: no route keeps the old layout", () => {
    for (const { p, text } of all) {
      expect(text, p).not.toMatch(/\bemptyLayout\b|\bProcessingBar\b|processing-loader/);
    }
    const shell = read("tools/editor/editor.css").match(/\.ed-shell \{[^}]*\}/)?.[0] ?? "";
    expect(shell).not.toMatch(/position:\s*fixed/);
  });

  it("AC-652: every test id §8 keeps is still rendered somewhere in src", () => {
    const kept = ["drop-card", "tool-intro", "primary-action", "dock-status", "dock-options", "options-button", "pages-scroll", "options-sheet", "options-popover", "processing", "process-error", "result", "result-name", "save-main", "editor-shell", "tool-flow", "editor"];
    const text = all.map((f) => f.text).join("\n");
    for (const id of kept) expect(text.includes(`"${id}"`), id).toBe(true);
  });

  it("dock-bar: matches the top row and the bottom bar; dock-side: the settings panel", () => {
    const css = read("app/globals.css");
    const bar = css.match(/@custom-variant dock-bar \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(bar).toContain('[data-ip-dock="bar"] *');
    expect(bar).toContain('[data-ip-dock="row"] *');
    expect(bar).toMatch(/@media \(width < 64rem\)/);
    const side = css.match(/@custom-variant dock-side \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(side).toContain('[data-ip-options="side"] *');
    expect(side).toMatch(/@media \(width >= 64rem\)/);
  });
});
