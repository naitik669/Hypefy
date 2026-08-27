import { Page, expect } from "@playwright/test";

/**
 * Test account credentials — env-only, never committed. Set E2E_EMAIL and
 * E2E_PASSWORD in .env.local (gitignored) or CI secrets. Previously these had
 * hardcoded fallbacks, which leaked a live account password into git history.
 */
function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. E2E tests need a throwaway account: ` +
        `set E2E_EMAIL and E2E_PASSWORD in .env.local or your CI secrets.`,
    );
  }
  return v;
}

export const TEST_EMAIL = required("E2E_EMAIL");
export const TEST_PASSWORD = required("E2E_PASSWORD");

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
