/**
 * The test-only fixture routes (F25 AC-623, /test-fixtures/*) answer only on a server started for the
 * suite (IP_TEST_FIXTURES=1, playwright.config.ts). A deployed environment (BASE_URL set) serves them as
 * 404 by design, so the specs that use them skip there instead of failing.
 */
export const fixturesServed = !process.env.BASE_URL || process.env.IP_TEST_FIXTURES === "1";
export const FIXTURES_OFF = "the test fixtures are served only by an e2e server (IP_TEST_FIXTURES=1), not by a deployed BASE_URL";
