"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { writeLog } from "./adapters/mock";
import { exportName } from "./adapters/native";
import type { Picked } from "./adapters/types";

export type MockChoice = Picked[] | "cancel" | "denied" | "unreachable";

/** Fixtures the mock can return (tests/fixtures, served by /cloud-mock/<name>). Sizes are reported by the server. */
const FIXTURES = ["alpha.pdf", "bravo.pdf", "echo.pdf", "charlie.png", "notes.txt", "user-pw.pdf", "corrupt.pdf", "three-pages.pdf"];
const MB = 1024 * 1024;

function item(id: string, fixture: string, opts: { as?: string; slow?: boolean; fail?: boolean; size?: number; status?: number; reason?: string; native?: boolean } = {}): Picked {
  // A "Google document" arrives as an exported PDF, like the real Drive adapter (AC-141).
  const name = opts.native ? exportName(opts.as ?? fixture) : (opts.as ?? fixture);
  return {
    id,
    name,
    native: opts.native,
    size: opts.size ?? 0,
    request: async () => {
      writeLog((l) => l.downloads.push(name));
      const q = new URLSearchParams();
      if (opts.slow) q.set("slow", "1");
      if (opts.fail) q.set("fail", "1");
      if (opts.status) q.set("status", String(opts.status));
      if (opts.reason) q.set("reason", opts.reason);
      const url = `/cloud-mock/${encodeURIComponent(fixture)}`;
      // Real pickers report each file's size up front; streamed bodies carry no Content-Length.
      const total = opts.status || opts.native ? undefined : Number(await (await fetch(`${url}?size=1`)).text()) || undefined;
      return { url: `${url}${q.size ? `?${q}` : ""}`, name, type: fixture.endsWith(".pdf") ? "application/pdf" : "", total };
    },
  };
}

/**
 * The mock provider's own "picker" (CI only): pick fixtures, plus the states tests need
 * (spec §7: slow download, mid-download failure, a 403 file, a 101 MB file, denied, unreachable).
 */
export function MockPicker({ multiple, onChoose }: { multiple: boolean; onChoose: (c: MockChoice) => void }) {
  const [sel, setSel] = useState<string[]>([]);
  const [slow, setSlow] = useState<string>("");
  const [failOnce, setFailOnce] = useState<string>("");
  const toggle = (f: string) => setSel((s) => (multiple ? (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]) : [f]));
  const pick = () => {
    const failed = new Set<string>();
    onChoose(
      sel.map((f, i) => {
        const base = item(`f${i + 1}`, f, { slow: slow === f || slow === "*" });
        if (failOnce !== f) return base;
        // Fails the first time only, so Retry (without the picker) then succeeds (AC-150).
        return {
          ...base,
          request: async () => {
            const r = await base.request();
            if (failed.has(f)) return r;
            failed.add(f);
            return { ...r, url: `${r.url}${r.url.includes("?") ? "&" : "?"}fail=1` };
          },
        };
      }),
    );
  };
  return (
    <div className="ip-cw__mock" data-testid="mock-picker">
      <fieldset>
        <legend className="ip-cw__text">Mock files</legend>
        {FIXTURES.map((f) => (
          <label key={f}>
            <input type={multiple ? "checkbox" : "radio"} name="mock-file" checked={sel.includes(f)} onChange={() => toggle(f)} />
            {f}
          </label>
        ))}
      </fieldset>
      <label>
        Slow file
        <select value={slow} onChange={(e) => setSlow(e.target.value)} aria-label="Slow file">
          <option value="">none</option>
          <option value="*">all</option>
          {FIXTURES.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label>
        Fail once
        <select value={failOnce} onChange={(e) => setFailOnce(e.target.value)} aria-label="Fail once">
          <option value="">none</option>
          {FIXTURES.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <div className="ip-cw__mock-actions">
        <Button variant="primary" onClick={pick} disabled={!sel.length}>
          Pick
        </Button>
        <Button variant="outline" onClick={() => onChoose("cancel")}>
          Cancel
        </Button>
        <Button variant="outline" onClick={() => onChoose([item("big", "alpha.pdf", { as: "huge-scan.pdf", size: 101 * MB }), item("a", "alpha.pdf")])}>
          101 MB file
        </Button>
        <Button variant="outline" onClick={() => onChoose([item("r", "alpha.pdf", { as: "budget.pdf", status: 403 }), item("b", "bravo.pdf")])}>
          403 file
        </Button>
        <Button variant="outline" onClick={() => onChoose(Array.from({ length: 51 }, (_, i) => item(`n${i + 1}`, "alpha.pdf", { as: `file-${String(i + 1).padStart(2, "0")}.pdf` })))}>
          51 files
        </Button>
        <Button variant="outline" onClick={() => onChoose([item("doc", "three-pages.pdf", { as: "Plan", native: true }), item("big-doc", "alpha.pdf", { as: "Big plan", native: true, status: 403, reason: "exportSizeLimitExceeded" })])}>
          Google documents
        </Button>
        <Button variant="outline" onClick={() => onChoose("denied")}>
          Deny access
        </Button>
        <Button variant="outline" onClick={() => onChoose("unreachable")}>
          Unreachable
        </Button>
      </div>
    </div>
  );
}
