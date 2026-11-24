/**
 * F23 hand-off protocol between a tool tab and its `/cloud/<provider>` window
 * (research §3.1, spec D-3). Both sides talk over `BroadcastChannel("cloud:<req>")`,
 * where `<req>` is a random UUID made for one request. The window's opener link is cut
 * (its COOP differs, or it went through an OAuth redirect), so there is no `window.opener`
 * and no `win.closed`: the window sends a heartbeat every second and the tool tab answers it.
 *
 * Every message is checked here before either side acts on it: an unknown shape, another
 * request's id, a field of the wrong type or a non-File "file" is dropped (null).
 */
import { hasAcceptedType, type AcceptSpec } from "@/lib/pdf/validation";
import { isProvider, isRoute, type CloudProvider, type CloudRoute } from "./providers";

export const HEARTBEAT_MS = 1000;
/** The tool tab treats this much silence from the window as "closed" (= cancelled). */
export const WINDOW_LOST_MS = 3000;
/** Before the first message the window is still loading: allow longer. */
export const FIRST_CONTACT_MS = 15000;
/** The window treats this much silence from the tool tab as "lost its tool" (AC-168: within 5 s). */
export const TOOL_LOST_MS = 4000;

/** At most this many files in one request (a hard cap on top of each tool's own limits). */
export const MAX_FILES_PER_MESSAGE = 200;
const MAX_TEXT = 1024;

export type ErrorCode = "unreachable" | "denied" | "offline" | "unknown";
export type SkipReason = "size" | "type" | "access";

export type FromWindow =
  | { t: "ready" }
  | { t: "hb" }
  | { t: "progress"; id: string; name: string; loaded: number; total: number }
  | { t: "files"; files: { id: string; file: File }[] }
  | { t: "skipped"; items: { name: string; reason: SkipReason }[] }
  | { t: "failed"; id: string; name: string }
  | { t: "done" }
  | { t: "cancel" }
  | { t: "error"; code: ErrorCode }
  | { t: "saveProgress"; loaded: number; total: number }
  | { t: "saved"; name: string; link?: string };

export type FromTool =
  | { t: "pong" }
  | { t: "ack" }
  | { t: "cancel" }
  | { t: "stop"; id: string }
  | { t: "retry"; id: string }
  | { t: "save"; file: File };

/** What actually travels: the message plus its sender and request id. */
export type Envelope<M> = M & { from: "window" | "tool"; req: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isRequestId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const channelName = (req: string) => `cloud:${req}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const isFile = (v: unknown): v is File => typeof File !== "undefined" && v instanceof File;
const ERRORS: readonly ErrorCode[] = ["unreachable", "denied", "offline", "unknown"];
const SKIPS: readonly SkipReason[] = ["size", "type", "access"];

function envelope(data: unknown, from: "window" | "tool", req: string): Record<string, unknown> | null {
  if (!isObj(data) || data.from !== from || data.req !== req || typeof data.t !== "string") return null;
  return data;
}

/** A message the window sent on request `req`, or null if it is not one we expect. */
export function parseFromWindow(data: unknown, req: string): FromWindow | null {
  const m = envelope(data, "window", req);
  if (!m) return null;
  switch (m.t) {
    case "ready":
    case "hb":
    case "done":
    case "cancel":
      return { t: m.t };
    case "progress":
      if (!isId(m.id) || !isText(m.name) || !isCount(m.loaded) || !isCount(m.total)) return null;
      return { t: "progress", id: m.id, name: m.name, loaded: m.loaded, total: m.total };
    case "files": {
      if (!Array.isArray(m.files) || m.files.length === 0 || m.files.length > MAX_FILES_PER_MESSAGE) return null;
      const files: { id: string; file: File }[] = [];
      for (const f of m.files) {
        if (!isObj(f) || !isId(f.id) || !isFile(f.file)) return null;
        files.push({ id: f.id, file: f.file });
      }
      return { t: "files", files };
    }
    case "skipped": {
      if (!Array.isArray(m.items) || m.items.length === 0 || m.items.length > MAX_FILES_PER_MESSAGE) return null;
      const items: { name: string; reason: SkipReason }[] = [];
      for (const it of m.items) {
        if (!isObj(it) || !isText(it.name) || !SKIPS.includes(it.reason as SkipReason)) return null;
        items.push({ name: it.name, reason: it.reason as SkipReason });
      }
      return { t: "skipped", items };
    }
    case "failed":
      if (!isId(m.id) || !isText(m.name)) return null;
      return { t: "failed", id: m.id, name: m.name };
    case "error":
      if (!ERRORS.includes(m.code as ErrorCode)) return null;
      return { t: "error", code: m.code as ErrorCode };
    case "saveProgress":
      if (!isCount(m.loaded) || !isCount(m.total)) return null;
      return { t: "saveProgress", loaded: m.loaded, total: m.total };
    case "saved": {
      if (!isText(m.name)) return null;
      const link = typeof m.link === "string" && /^https:\/\//.test(m.link) && m.link.length <= 2048 ? m.link : undefined;
      return { t: "saved", name: m.name, link };
    }
    default:
      return null;
  }
}

/** A message the tool tab sent on request `req`, or null. */
export function parseFromTool(data: unknown, req: string): FromTool | null {
  const m = envelope(data, "tool", req);
  if (!m) return null;
  switch (m.t) {
    case "pong":
    case "ack":
    case "cancel":
      return { t: m.t };
    case "stop":
    case "retry":
      return isId(m.id) ? { t: m.t, id: m.id } : null;
    case "save":
      return isFile(m.file) ? { t: "save", file: m.file } : null;
    default:
      return null;
  }
}

export function wrap<M extends { t: string }>(from: "window" | "tool", req: string, m: M): Envelope<M> {
  return { ...m, from, req };
}

// ---- files arriving in the tool tab ----------------------------------------------------

export type IncomingLimits = { accept: AcceptSpec; maxFileBytes: number; multiple: boolean };

/**
 * The tool tab's own check of files from the window (never trust the other side): a file over
 * the tool's size cap or of a type the tool doesn't take is skipped with that reason, and a
 * single-file tool takes only the first file of the whole request (`alreadyReceived` counts
 * files accepted earlier on the same request).
 */
export function screenIncoming(files: readonly File[], limits: IncomingLimits, alreadyReceived = 0): { accepted: File[]; skipped: { name: string; reason: SkipReason }[] } {
  const accepted: File[] = [];
  const skipped: { name: string; reason: SkipReason }[] = [];
  for (const file of files) {
    if (!limits.multiple && alreadyReceived + accepted.length >= 1) continue; // unexpected: dropped
    if (!hasAcceptedType(file, limits.accept)) skipped.push({ name: file.name, reason: "type" });
    else if (file.size > limits.maxFileBytes) skipped.push({ name: file.name, reason: "size" });
    else accepted.push(file);
  }
  return { accepted, skipped };
}

// ---- the window's URL -------------------------------------------------------------------

export type WindowParams = {
  req: string;
  /** Lower-case extensions with the dot, e.g. [".pdf", ".png"]. */
  accept: string[];
  multiple: boolean;
  /** The tool's per-file size cap in bytes. */
  max: number;
  /** Tool name for "Added to Merge PDF". */
  tool: string;
  /** Which provider the mock window stands in for (only on /cloud/mock). */
  provider?: CloudProvider;
  /** Save mode: the window uploads the file the tool sends. */
  mode?: "pick" | "save";
};

export function windowUrl(route: CloudRoute, p: WindowParams): string {
  const q = new URLSearchParams({ req: p.req, accept: p.accept.join(","), multiple: p.multiple ? "1" : "0", max: String(p.max), tool: p.tool });
  if (route === "mock" && p.provider) q.set("p", p.provider);
  if (p.mode === "save") q.set("mode", "save");
  return `/cloud/${route}?${q.toString()}`;
}

const EXT = /^\.[a-z0-9]{1,8}$/;

/** Reads and checks the window's own URL; null when anything is missing or malformed. */
export function parseWindowParams(route: string, search: string): (WindowParams & { route: CloudRoute }) | null {
  if (!isRoute(route)) return null;
  const q = new URLSearchParams(search);
  const req = q.get("req");
  if (!isRequestId(req)) return null;
  const accept = (q.get("accept") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (accept.length === 0 || accept.length > 20 || !accept.every((e) => EXT.test(e))) return null;
  const max = Number(q.get("max"));
  if (!Number.isSafeInteger(max) || max <= 0) return null;
  const multiple = q.get("multiple") === "1";
  const tool = (q.get("tool") ?? "").slice(0, 80) || "BerryPDF";
  const mode = q.get("mode") === "save" ? "save" : "pick";
  const p = q.get("p");
  if (route === "mock" && !isProvider(p)) return null;
  return { route, req, accept, multiple, max, tool, mode, provider: route === "mock" ? (p as CloudProvider) : (route as CloudProvider) };
}

/** Crypto-random UUID (tests can pass their own). */
export function newRequestId(): string {
  return crypto.randomUUID();
}
