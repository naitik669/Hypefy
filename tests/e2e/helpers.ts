import { Page, expect, test } from "@playwright/test";

/**
 * Test account credentials — env-only, never committed. Set E2E_EMAIL and
 * E2E_PASSWORD in .env.local (gitignored) or CI secrets. These once had
 * hardcoded fallbacks, which leaked a live account password into git history;
 * do not reintroduce them.
 *
 * Read, not required. They used to go through a `required()` that threw at
 * module load, so importing this file without the env set failed the whole
 * spec at COLLECTION — every test in it reported as a failure, including the
 * ones that need no account at all. That is also why Playwright could not be
 * turned on in CI: a repo without the secrets would have gone permanently
 * red rather than reporting honest skips.
 */
export const TEST_EMAIL = process.env.E2E_EMAIL ?? "";
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "";

/** Whether a test account is configured in this environment. */
export function hasCredentials(): boolean {
  return Boolean(TEST_EMAIL && TEST_PASSWORD);
}

/**
 * Skip the current test (or describe block) when no account is configured.
 *
 * Says which variables are missing, because "skipped" with no reason is how a
 * suite quietly stops covering anything.
 */
export function needsAccount() {
  test.skip(
    !hasCredentials(),
    "No test account: set E2E_EMAIL and E2E_PASSWORD in .env.local or CI secrets.",
  );
}

/** Sign in through the real /signin UI and land on an authenticated page. */
export async function signIn(page: Page) {
  await page.goto("/signin");
  await page.getByPlaceholder("Enter your email address").fill(TEST_EMAIL);
  const pw = page.getByPlaceholder("Password");
  await pw.fill(TEST_PASSWORD);
  // Submit via Enter — avoids an actionability wait on the submit button.
  await pw.press("Enter");
  // Onboarding/home — either way we're past the auth wall.
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"), { timeout: 60_000 });
}

/** Go to home and wait for the authenticated app shell (bottom nav) to render. */
export async function waitForHome(page: Page) {
  await page.goto("/home");
  await expect(page.locator('a[href="/messages"]').first()).toBeVisible({ timeout: 90_000 });
}

/**
 * The widest the page may scroll horizontally.
 *
 * Not zero: sub-pixel layout rounding and a scrollbar gutter both show up as a
 * stray pixel or two on a perfectly correct layout, and a test that fails on
 * those gets switched off rather than fixed.
 */
export const SCROLL_SLOP = 2;

/**
 * Assert the page does not scroll sideways at the current viewport.
 *
 * The check Phase 4 (responsive web) will lean on hardest, which is why it
 * lives here rather than in one spec: today's app is a 480px column centred on
 * a wide page, so this passes trivially at desktop width and will keep passing
 * as the real layout arrives — unless something overflows, which is the whole
 * point.
 */
export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(SCROLL_SLOP);
}
