#!/usr/bin/env node
/**
 * Generates every icon the app draws from Phosphor's Duotone set (@phosphor-icons/core, MIT),
 * the icon family of the BerryPDF design system (docs/design/berrypdf.md, Icons).
 *
 *   node scripts/gen-tool-icons.mjs
 *
 * Writes (all committed, all server-safe: no hooks, no "use client"):
 *   src/tools/tool-icon-names.ts   the tool icon names (and the ToolIconName type)
 *   src/tools/tool-icons.tsx       <ToolIcon name=...>: one inline SVG per tool icon
 *   src/components/ui/icons.tsx    the interface icons (FileIcon, CloseIcon, ...)
 *   src/components/ui/page-tool-icons.tsx   the icons only the F5 page tools draw (kept out of the shared chunk)
 *
 * Only path data is vendored, so @phosphor-icons/core stays an exact-pinned devDependency and
 * nothing is added to the client bundle at runtime. The build fails here if a name goes missing.
 * Every tool has its own icon (BerryPDF: "Give every tool its own icon"); a duplicate fails too.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// The package exports only its JS entry, so find the folder from node_modules directly.
const pkgDir = join(here, "..", "node_modules", "@phosphor-icons", "core");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

/** Every icon a registry tool may use (Phosphor names, duotone weight). Add a name, then rerun. */
const TOOL_ICONS = [
  "angle",
  "arrow-clockwise",
  "arrows-in",
  "arrows-merge",
  "arrows-out",
  "arrows-split",
  "bookmark-simple",
  "bookmarks",
  "cards",
  "circle-half",
  "columns",
  "crop",
  "eraser",
  "export",
  "file-doc",
  "file-image",
  "file-minus",
  "file-pdf",
  "file-ppt",
  "file-txt",
  "file-xls",
  "flip-horizontal",
  "flow-arrow",
  "globe",
  "grid-four",
  "hash",
  "image",
  "images",
  "list-numbers",
  "lock",
  "lock-open",
  "pencil-simple-line",
  "rows",
  "ruler",
  "scan",
  "shuffle",
  "signature",
  "squares-four",
  "stack-simple",
  "stamp",
  "tag",
  "text-aa",
  "text-columns",
  "textbox",
  "wrench",
];

/** Interface icons: exported component name -> Phosphor name. */
const UI_ICONS = {
  FileIcon: "file",
  FilesIcon: "files",
  PlusIcon: "plus@bold",
  MinusIcon: "minus@bold",
  RotateLeftIcon: "arrow-counter-clockwise@bold",
  RotateRightIcon: "arrow-clockwise@bold",
  ResetIcon: "arrow-u-up-left@bold",
  // Bold, not duotone, for small controls (x, check, plus, minus, carets, arrows, rotate, enlarge): the duotone fill
  // sits behind them as a shaded square or triangle that reads as a box (owner 2026-11-24).
  CloseIcon: "x@bold",
  EyeIcon: "eye",
  LockIcon: "lock-simple",
  CheckIcon: "check@bold",
  CheckCircleIcon: "check-circle",
  DownloadIcon: "download-simple",
  UploadIcon: "upload-simple",
  ShareIcon: "share-network",
  AlertIcon: "warning-circle",
  ErrorIcon: "x-circle",
  InfoIcon: "info",
  EnlargeIcon: "arrows-out-simple@bold",
  ChevronLeftIcon: "caret-left@bold",
  ChevronRightIcon: "caret-right@bold",
  ChevronDownIcon: "caret-down@bold",
  ShieldIcon: "shield-check",
  SearchIcon: "magnifying-glass",
  GridIcon: "squares-four",
  ClockIcon: "clock",
  DeviceIcon: "browser",
  ArrowRightIcon: "arrow-right@bold",
  ArrowLeftIcon: "arrow-left@bold",
  LeafIcon: "leaf",
  // Page tools (spec F4/F5 UI P-4, decision 15): bold, drawn bare on small controls. The ones only
  // the F5 workspace draws live in PAGE_TOOL_ICONS below.
  ScissorsIcon: "scissors@bold",
  TrashIcon: "trash@bold",
  SlidersIcon: "sliders-horizontal@bold",
  DownloadSimpleIcon: "download-simple@bold",
};

/**
 * Icons only the F5 page tools draw, after a file is in (spec F4/F5 P-4: history, Organize's menus).
 * They go to their own module: icons.tsx sits in a chunk every route loads, so each icon there costs
 * every page's first load (P-12).
 */
const PAGE_TOOL_ICONS = {
  UndoIcon: "arrow-u-up-left@bold",
  RedoIcon: "arrow-u-up-right@bold",
  SelectAllIcon: "selection-all@bold",
  SelectInverseIcon: "selection-inverse@bold",
  MoreIcon: "dots-three@bold",
};

/** "name" is the duotone weight; "name@bold" picks another weight. */
const iconFile = (n) => {
  const [name, weight = "duotone"] = n.split("@");
  return join(pkgDir, "assets", weight, `${name}-${weight}.svg`);
};
const iconLabel = (n) => (n.includes("@") ? n.replace("@", ", ") : `${n}, duotone`);
const license = readFileSync(join(pkgDir, "LICENSE"), "utf8").trim();
const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const all = [...new Set([...TOOL_ICONS, ...Object.values(UI_ICONS), ...Object.values(PAGE_TOOL_ICONS)])];
const missing = all.filter((n) => {
  try {
    readFileSync(iconFile(n));
    return false;
  } catch {
    return true;
  }
});
if (missing.length) {
  console.error(`gen-tool-icons: not in @phosphor-icons/core ${pkg.version} (duotone): ${missing.join(", ")}`);
  process.exit(1);
}
const dupes = TOOL_ICONS.filter((n, i) => TOOL_ICONS.indexOf(n) !== i);
if (dupes.length) {
  console.error(`gen-tool-icons: duplicate tool icons: ${dupes.join(", ")}`);
  process.exit(1);
}

const header = `/*
 * GENERATED by scripts/gen-tool-icons.mjs from @phosphor-icons/core ${pkg.version} (Duotone). Do not edit.
 *
 * Icons: Phosphor Icons (https://phosphoricons.com). License notice, as shipped in @phosphor-icons/core:
 *
${license
  .split("\n")
  .map((l) => ` * ${l}`.trimEnd())
  .join("\n")}
 */
`;

const SHAPES = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);

/** The shape elements inside one Phosphor SVG file (the outer <svg> frame is ours). */
function shapesOf(name) {
  const svg = readFileSync(iconFile(name), "utf8");
  const body = svg.slice(svg.indexOf(">", svg.indexOf("<svg")) + 1, svg.lastIndexOf("</svg>"));
  const out = [];
  for (const m of body.matchAll(/<([a-z]+)\s([^>]*?)\/?>/g)) {
    const [, tag, rawAttrs] = m;
    if (!SHAPES.has(tag)) throw new Error(`gen-tool-icons: unexpected <${tag}> in ${name}`);
    const props = [...rawAttrs.matchAll(/([a-z0-9-]+)="([^"]*)"/g)].map(([, k, v]) => `${camel(k)}="${esc(v)}"`).join(" ");
    out.push(`<${tag} ${props} />`);
  }
  if (!out.length) throw new Error(`gen-tool-icons: no shapes in ${name}`);
  return out.join("");
}

const names = `${header}
export const toolIconNames = [
${TOOL_ICONS.map((n) => `  "${n}",`).join("\n")}
] as const;

export type ToolIconName = (typeof toolIconNames)[number];
`;

const toolIcons = `${header}
import type { ReactElement } from "react";
import type { ToolIconName } from "./tool-icon-names";

const shapes: Record<ToolIconName, ReactElement> = {
${TOOL_ICONS.map((n) => `  "${n}": <>${shapesOf(n)}</>,`).join("\n")}
};

/**
 * A tool icon: Phosphor Duotone on a 256 grid, drawn in currentColor with its main shape at 20%.
 * Decorative (aria-hidden). Server-safe.
 */
export function ToolIcon({ name, size = 22, className }: { name: ToolIconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      {shapes[name]}
    </svg>
  );
}
`;

const uiIcons = `${header}
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

/** Phosphor Duotone frame: 256 grid, currentColor, decorative (aria-hidden). */
function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export type IconComponent = (props: IconProps) => React.ReactElement;
${Object.entries(UI_ICONS)
  .map(([comp, n]) => `\n/** Phosphor ${iconLabel(n)}. */\nexport const ${comp}: IconComponent = (p) => <Icon {...p}>${shapesOf(n)}</Icon>;`)
  .join("\n")}
`;

const pageToolIcons = `${header}
import type { IconComponent } from "./icons";

/** Phosphor frame: 256 grid, currentColor, decorative (aria-hidden). */
const frame = (size = 20, rest: object, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
    {children}
  </svg>
);
${Object.entries(PAGE_TOOL_ICONS)
  .map(([comp, n]) => `\n/** Phosphor ${iconLabel(n)}. */\nexport const ${comp}: IconComponent = ({ size, ...p }) => frame(size, p, <>${shapesOf(n)}</>);`)
  .join("\n")}
`;

writeFileSync(join(here, "../src/tools/tool-icon-names.ts"), names);
writeFileSync(join(here, "../src/components/ui/page-tool-icons.tsx"), pageToolIcons);
writeFileSync(join(here, "../src/tools/tool-icons.tsx"), toolIcons);
writeFileSync(join(here, "../src/components/ui/icons.tsx"), uiIcons);
console.log(`gen-tool-icons: wrote ${TOOL_ICONS.length} tool icons and ${Object.keys(UI_ICONS).length + Object.keys(PAGE_TOOL_ICONS).length} interface icons from @phosphor-icons/core ${pkg.version}`);
