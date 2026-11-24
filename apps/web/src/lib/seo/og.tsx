/**
 * Social share images (Open Graph / X), rendered once at build by `next/og` (bundled with Next,
 * MIT; its renderer satori and resvg are MPL-2.0) and served as static PNGs.
 *
 * Fonts: Fredoka 600, a static instance of the @fontsource-variable/fredoka file we already ship
 * (SIL OFL 1.1, no Reserved Font Name; licence in ./fonts/OFL.txt), because the renderer can't
 * read WOFF2. The berry is a PNG of our own BerryMark.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { OG_SIZE, SITE_NAME } from "./site";

const dir = join(process.cwd(), "src", "lib", "seo");
const font = () => readFileSync(join(dir, "fonts", "fredoka-600.ttf"));
const berry = () => `data:image/png;base64,${readFileSync(join(dir, "og-berry.png")).toString("base64")}`;

export const ogSize = OG_SIZE;
export const ogContentType = "image/png";

/** A BerryPDF card: grid paper, the berry, a big title and one short line. */
export function ogImage({ title, line }: { title: string; line: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 80px",
          backgroundColor: "#fffdfb",
          backgroundImage: "linear-gradient(rgba(217,43,75,.08) 2px, transparent 2px), linear-gradient(90deg, rgba(217,43,75,.08) 2px, transparent 2px)",
          backgroundSize: "40px 40px",
          fontFamily: "Fredoka",
          color: "#3a2a2e",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG by next/og, not a page */}
        <img src={berry()} width={300} height={300} alt="" style={{ marginRight: 40 }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 36, color: "#d92b4b", marginBottom: 12 }}>{SITE_NAME}</div>
          <div style={{ fontSize: title.length > 18 ? 76 : 92, lineHeight: 1.05, color: "#2a1c20" }}>{title}</div>
          <div style={{ fontSize: 34, marginTop: 24, color: "#7a6468" }}>{line}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [{ name: "Fredoka", data: font(), weight: 600, style: "normal" }] },
  );
}
