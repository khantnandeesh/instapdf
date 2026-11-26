import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX for Next ("preserve"); unit tests that render a component (renderToStaticMarkup) need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  // Component CSS imports are not under test: skip PostCSS (the app's config is for Next's Tailwind).
  css: { postcss: { plugins: [] } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"], environment: "node", globalSetup: ["./vitest.global-setup.ts"] },
});
