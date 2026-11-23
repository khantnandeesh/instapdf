/** Shared axe check for the e2e suites (F1 AC-50, F2 AC-56). */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** WCAG levels we test against, on top of axe's default ruleset. */
export const AXE_WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Runs axe and fails on any serious or critical violation.
 *
 * Coverage is the union of two passes:
 * 1. axe's full default ruleset for the pinned axe-core (WCAG and best-practice rules).
 * 2. every rule tagged with one of AXE_WCAG_TAGS, including rules axe still ships as
 *    "experimental" and so leaves out of the default run. F2's `label-content-name-mismatch`
 *    (WCAG 2.5.3) was experimental in axe-core 4.11, which is why our old default-only check
 *    missed it while the evaluator's 4.14 run flagged it.
 * `withTags()` on its own would be narrower than (1): it runs only the tagged rules.
 * Note: bumping axe-core can surface new (experimental-rule) violations; fix them, don't filter them out.
 */
/** Waits until entry animations (menu drop-in, scrim fade, dialogs) finish, so contrast is measured on final colors. */
export const settled = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || (a.effect?.getComputedTiming().iterations ?? 1) === Infinity));

export async function expectNoSeriousAxeViolations(page: Page, state: string) {
  await settled(page);
  const defaults = await new AxeBuilder({ page }).analyze();
  // Tags are OR-ed; "experimental" lifts axe's default exclusion. Keep only WCAG-tagged rules
  // from this pass so experimental best-practice rules do not sneak in.
  const wcag = await new AxeBuilder({ page }).withTags([...AXE_WCAG_TAGS, "experimental"]).analyze();
  const wcagOnly = wcag.violations.filter((v) => v.tags.some((t) => AXE_WCAG_TAGS.includes(t)));
  const byId = new Map([...defaults.violations, ...wcagOnly].map((v) => [v.id, v]));
  const bad = [...byId.values()]
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(bad, `axe, ${state}`).toEqual([]);
}
