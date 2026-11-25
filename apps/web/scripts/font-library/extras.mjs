/**
 * Families the open catalogues do not carry, each taken from its maker's own release at a pinned
 * version. Every download is checked against the sha256 written here, so a release that changes
 * under its name is refused, not published: the build stops, so a publish never drops the family
 * quietly.
 *
 * The files are published exactly as released (no slicing, no conversion): a font under the OFL
 * with a reserved name may only keep that name unchanged.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gate } from "./lib.mjs";
import { cmapRanges, woffToSfnt } from "./sfnt.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const EXTRAS = [
  {
    // Segoe UI's metric twin (AC-283), from Microsoft's own repository.
    id: "selawik",
    family: "Selawik",
    license: "OFL-1.1",
    category: "sans-serif",
    version: "1.01",
    lastModified: "2015-11-17",
    source: "microsoft/Selawik",
    home: "https://github.com/microsoft/Selawik/releases/tag/1.01",
    archive: { url: "https://github.com/microsoft/Selawik/releases/download/1.01/Selawik_Release.zip", sha256: "3f62c51e05e3b5a1e6241cf92a371f0be2ea1183aa87b30718bbd40832a8d423" },
    licenceText: { url: "https://raw.githubusercontent.com/microsoft/Selawik/1.01/LICENSE.txt", sha256: "77b7c2506d4efb22e09c8ccf10159f4956eab3ef7c007fef95de136bcf45300c" },
    // Semilight is left out: its file gives the same weight class as Light (300).
    faces: {
      "300-normal": { file: "selawkl.woff", sha256: "4fee03bc0a23bb5694cb83df8ae73cb8f2e1187450eb0ef7d3b2248feef9c521" },
      "400-normal": { file: "selawk.woff", sha256: "0afcda7203f704b1c5ab1e151e8a4994df0c1e140e9101063cc827e85b663108" },
      "600-normal": { file: "selawksb.woff", sha256: "0d050214e2fc8d2e9025d317402e56fba99694cc10a080fece122e0e8c1ad9dd" },
      "700-normal": { file: "selawkb.woff", sha256: "07f58cf199333905117ac622e5d67aae0c760afcb0c54b756ddc048db67075e0" },
    },
  },
];

/** [[32, 126], [160, 255]] → "U+20-7E,U+A0-FF". */
export const rangesToCss = (ranges) => ranges.map(([lo, hi]) => (lo === hi ? `U+${lo.toString(16)}` : `U+${lo.toString(16)}-${hi.toString(16)}`)).join(",");

/** The bytes when they have the pinned sha256, else an error naming what did not match. */
export function pinned(bytes, want, what) {
  if (!bytes || sha256(bytes) !== want) throw new Error(`${what} does not match its pinned checksum`);
  return bytes;
}

/**
 * One pinned family as a source for build-library.mjs. The whole font is one file ("latin"),
 * listed with the characters it really has.
 *
 * @param extra one row of EXTRAS
 * @param get (url) => bytes or null: the build's polite fetch
 * @param unzip (archive bytes, file name) => bytes: reads one file out of the archive
 */
export function extraSource(extra, get, unzip = unzipOne) {
  const keys = Object.keys(extra.faces);
  const g = gate({ ...extra, subsets: ["latin"], weights: [...new Set(keys.map((k) => Number(k.split("-")[0])))], styles: [...new Set(keys.map((k) => k.split("-")[1]))] }, extra.source);
  if (!g.ok) throw new Error(`${extra.id}: ${g.reason}`);
  const files = new Map();
  let licence = "";
  const src = {
    entry: g.entry,
    defSubset: "latin",
    /** @type {Record<string, string>} */
    unicode: {},
    origin: { name: extra.source, version: extra.version, url: extra.home },
    prepare: async () => {
      const archive = pinned(await get(extra.archive.url), extra.archive.sha256, `${extra.id} ${extra.version} archive`);
      for (const [key, face] of Object.entries(extra.faces)) files.set(key, pinned(await unzip(archive, face.file), face.sha256, `${extra.id} ${face.file}`));
      licence = pinned(await get(extra.licenceText.url), extra.licenceText.sha256, `${extra.id} licence`).toString("utf8");
      const sfnt = woffToSfnt(files.get("400-normal") ?? files.values().next().value);
      src.unicode = { latin: rangesToCss(sfnt ? cmapRanges(sfnt) : []) };
      return true;
    },
    /** @returns {Promise<Buffer | null>} */
    read: async (subset, weight, style) => (subset === "latin" ? (files.get(`${weight}-${style}`) ?? null) : null),
    // The notice says where the files came from, then gives the licence as released.
    licence: async () => `${extra.family} ${extra.version}, as released at ${extra.home}\n\n${licence}`,
  };
  return src;
}

/** Reads one named file out of a zip archive with the system's unzip (the name is taken literally). */
async function unzipOne(archive, name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) throw new Error(`bad file name ${name}`);
  const dir = await mkdtemp(join(tmpdir(), "font-extra-"));
  try {
    const zip = join(dir, "archive.zip");
    await writeFile(zip, archive);
    return execFileSync("unzip", ["-p", zip, name], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
