import { Page, expect } from "@playwright/test";

/** Test account (throwaway). Override via env for CI. */
export const TEST_EMAIL = process.env.E2E_EMAIL ?? "hypefy.postertest@gmail.com";
export const TEST_PASSWORD = process.env.E2E_PASSWORD ?? "PosterTest#2026";

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
