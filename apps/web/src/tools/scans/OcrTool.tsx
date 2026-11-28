"use client";
import { useEffect, useRef } from "react";
import { useRemembered } from "@/components/page-select/hooks";
import { MoreOptions } from "@/components/page-select/MoreOptions";
import { Group } from "@/components/page-select/OptionGroup";
import { ToolFlow } from "@/components/tool-flow/ToolFlow";
import type { ProcessFn } from "@/components/tool-flow/types";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { isOcrLanguage, languageForLocale, OCR_DEFAULT, OCR_LANGUAGES } from "@/lib/ocr/languages";
import type { OcrOutput } from "@/lib/ocr/ocr-run";
import { warmWorker } from "@/lib/pdf/worker-client";
import { flowTool } from "@/tools/registry";
import { ocrCopy as c } from "./copy";
import "../doc-tools/doc-tools.css";

const tool = flowTool("ocr-pdf");

type Remembered = { language: string; second: string; output: OcrOutput; skipText: boolean };
const defaults: Remembered = { language: OCR_DEFAULT, second: "", output: "pdf", skipText: true };
const OUTPUTS: OcrOutput[] = ["pdf", "text", "both"];
const LANGUAGES = OCR_LANGUAGES.map((l) => ({ value: l.code, label: l.name }));
const check = (s: Record<string, unknown>): Partial<Remembered> => ({
  ...(isOcrLanguage(s.language) ? { language: s.language } : {}),
  ...(s.second === "" || isOcrLanguage(s.second) ? { second: s.second as string } : {}),
  ...(OUTPUTS.includes(s.output as OcrOutput) ? { output: s.output as OcrOutput } : {}),
  ...(typeof s.skipText === "boolean" ? { skipText: s.skipText } : {}),
});

/**
 * OCR (spec F15 §2): the pages are read in this tab and the text found is laid over them, invisible,
 * so a scan can be searched and copied from. Pages that already have text are left alone.
 */
export function OcrTool() {
  const stored = useRef(false);
  const [opts, setOpts, optsLive] = useRemembered(tool.slug, defaults, check, () => (stored.current = true));
  // A first visit starts on the browser's own language when it is one of ours.
  useEffect(() => {
    if (!stored.current) setOpts({ language: languageForLocale(navigator.language) });
  }, [setOpts]);
  const process: ProcessFn = async (files, signal, onProgress) => {
    const { ocrPdfs } = await import("@/lib/ocr/ocr-run");
    const o = optsLive.current;
    return ocrPdfs(
      files.map((f) => ({ name: f.name, source: f.source, password: f.password, pageCount: f.pageCount })),
      { languages: o.second && o.second !== o.language ? [o.language, o.second] : [o.language], output: o.output, skipText: o.skipText },
      tool.flow.outputName?.(files.map((f) => f.name)) ?? "",
      signal,
      onProgress,
    );
  };
  const language = (where: string) => <Select id={`ocr-language-${where}`} label={c.language} hideLabel={where !== "more"} value={opts.language} options={LANGUAGES} onChange={(v) => setOpts({ language: v, ...(v === opts.second ? { second: "" } : {}) })} />;
  const second = (where: string) => (
    <Select id={`ocr-second-${where}`} label={c.second} value={opts.second} options={[{ value: "", label: c.none }, ...LANGUAGES.filter((l) => l.value !== opts.language)]} onChange={(v) => setOpts({ second: v })} />
  );
  const output = (where: string) => (
    <Select id={`ocr-output-${where}`} label={c.output} hideLabel={where === "side"} value={opts.output} options={OUTPUTS.map((value) => ({ value, label: c.outputs[value] }))} onChange={(v) => setOpts({ output: v })} />
  );
  const skip = (where: string) => ({ id: `ocr-skip-${where}`, label: c.skipText, value: opts.skipText, onChange: (skipText: boolean) => setOpts({ skipText }) });
  const changed = Number(!!opts.second) + Number(opts.output !== defaults.output) + Number(!opts.skipText);
  return (
    <ToolFlow
      tool={tool}
      process={process}
      warm={() => {
        warmWorker();
        void import("@/lib/ocr/ocr-run");
      }}
      renderMore={(ctx) => (
        <MoreOptions
          changed={changed}
          disabled={ctx.disabled}
          content={{
            togglesTitle: c.more,
            toggles: [skip("more")],
            extra: (
              <div className="flex flex-col gap-3">
                {second("more")}
                {output("more")}
              </div>
            ),
          }}
        />
      )}
      renderOptions={() => (
        <div className="flex min-w-0 items-center gap-3 dock-side:flex-col dock-side:items-stretch dock-bar:flex-1">
          <div className="ip-opt-bar min-w-0 dock-bar:flex-1">{language("bar")}</div>
          <div className="ip-opt-side">
            <Group n={1} title={c.stepLanguage}>
              {language("side")}
              {second("side")}
              <p className="ip-doc-note">{c.languageNote}</p>
            </Group>
            <Group n={2} title={c.stepResult}>
              {output("side")}
              <Switch {...(({ value, ...t }) => ({ ...t, checked: value }))(skip("side"))} spread />
              <p className="ip-doc-note">{c.resultNote}</p>
            </Group>
          </div>
        </div>
      )}
    />
  );
}
