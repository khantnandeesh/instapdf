"use client";
/**
 * Test-only settings tool (F25 AC-623): a client stub with Compress-like options that exercises the
 * settings layout (§4) until a real settings tool ships. Not in the registry or the sitemap; its route
 * answers 404 unless the server runs with IP_TEST_FIXTURES=1 (middleware.ts). `?tall=1` adds steps
 * taller than the stage (AC-621). `?server=1` makes it a server tool that runs through the job API
 * client (`runServerJob(httpJobApi())`, F25 §6), which `e2e/ui/progress-pill.spec.ts` mocks with routes.
 */
import { useEffect, useState } from "react";
import { Step } from "@/components/page-select/Step";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { httpJobApi, runServerJob } from "@/lib/jobs/server-job";
import type { FlowTool } from "@/tools/registry";

const MB = 1024 * 1024;

export const fixtureTool: FlowTool = {
  slug: "test-fixtures/settings-tool",
  name: "Compress (fixture)",
  summary: "Test fixture for the settings layout",
  category: "optimize",
  runtime: "client",
  status: "beta",
  icon: "arrows-in",
  ref: "",
  keywords: [],
  flow: {
    title: "Compress PDF",
    accept: { mime: ["application/pdf"], extensions: [".pdf"] },
    multiFile: false,
    maxFiles: 1,
    maxFileBytes: 100 * MB,
    maxTotalBytes: 100 * MB,
    maxTotalPages: 1000,
    defaultView: "pages",
    requiredPermissions: [],
    optionsDensity: "compact",
    layout: "settings",
    actionLabel: "Compress PDF",
    progressLabel: "Compressing",
    outputName: (inputs) => inputs[0]?.replace(/\.pdf$/i, "") + "-compressed.pdf",
  },
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("Cancelled", "AbortError"))), { once: true });
  });

/** A slow stub: ten steps of 150ms, then the input unchanged. */
const process: ProcessFn = async (files, signal, onProgress) => {
  for (let i = 1; i <= 10; i++) {
    await sleep(150, signal);
    onProgress(i / 10);
  }
  const f = files[0];
  return { name: fixtureTool.flow.outputName([f.name]), type: "application/pdf", blob: f.source, size: f.size, pageCount: f.pageCount, wasEncrypted: false };
};

/** The server variant: upload, queue, work and done through the (mocked) job API. */
const serverTool: FlowTool = { ...fixtureTool, runtime: "server" };
const serverProcess: ProcessFn = async (files, signal, _onProgress, job) => {
  const f = files[0];
  const out = await runServerJob(
    httpJobApi(),
    { tool: "compress-pdf", files: [{ name: f.name, blob: f.source }], options: {} },
    { signal, onPhase: job.onPhase, onCancel: job.onCancel, pollMs: 200 },
  );
  return { name: out.name, type: "application/pdf", blob: out.blob, size: out.blob.size, pageCount: f.pageCount, wasEncrypted: false };
};

const LEVELS = [
  { value: "less", label: "Less" },
  { value: "recommended", label: "Recommended" },
  { value: "extreme", label: "Extreme" },
];
const COLOURS = [
  { value: "keep", label: "Keep colour" },
  { value: "gray", label: "Grayscale" },
];

export function SettingsFixture() {
  const [level, setLevel] = useState("recommended");
  const [colour, setColour] = useState("keep");
  const [tall, setTall] = useState(false);
  const [server, setServer] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setTall(q.has("tall"));
    setServer(q.has("server"));
  }, []);
  return (
    <ToolFlow
      key={server ? "server" : "client"}
      tool={server ? serverTool : fixtureTool}
      process={server ? serverProcess : process}
      renderOptions={() => (
        <div className="flex items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-side:gap-7">
          <div className="flex min-w-0 flex-col gap-3.5 dock-bar:flex-1">
            <Step n={1}>Compression</Step>
            <SegmentedControl look="tiles" label="Compression" value={level} options={LEVELS} onChange={setLevel} fullWidth />
          </div>
          <div className="hidden flex-col gap-3.5 dock-side:flex">
            <Step n={2}>Colour</Step>
            <SegmentedControl look="tiles" label="Colour" value={colour} options={COLOURS} onChange={setColour} fullWidth />
          </div>
          {tall &&
            [3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="hidden flex-col gap-3.5 dock-side:flex" data-testid="tall-step">
                <Step n={n}>Extra step {n}</Step>
                <p className="h-24 rounded-[14px] border-[1.5px] border-sand p-3 text-sm text-muted">A tall option for the layout test.</p>
              </div>
            ))}
        </div>
      )}
    />
  );
}
