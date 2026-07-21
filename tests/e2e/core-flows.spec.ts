import { test, expect } from "@playwright/test";
import { signIn, waitForHome } from "./helpers";

/**
 * Smoke coverage of the five core flows. Deliberately NON-DESTRUCTIVE — each
 * flow is driven up to (but not committing) its write, so the suite is safe to
 * re-run against the shared Supabase project without creating posts, hypes,
 * blocks, or DMs. Flows that depend on account content skip cleanly when absent.
 */

test.describe.configure({ mode: "serial" });

test("1. sign in → authenticated home shell renders", async ({ page }) => {
  await signIn(page);
  await waitForHome(page);
  // Bottom nav links prove the signed-in app shell mounted.
  await expect(page.locator('a[href="/home"]').first()).toBeVisible();
  await expect(page.locator('a[href="/shots"]').first()).toBeVisible();
});

test("2. compose a post (form works, not submitted)", async ({ page }) => {
  await signIn(page);
  await page.goto("/create/post");
  const caption = page.getByPlaceholder("Write a caption…");
  await expect(caption).toBeVisible({ timeout: 90_000 });
  await caption.fill("e2e smoke — not submitted");
  // Post button enables once there's content; we assert, we don't click.
  await expect(page.getByRole("button", { name: /^Post$/ })).toBeEnabled();
});

test("3. hype control present on a feed post", async ({ page }) => {
  await signIn(page);
  await waitForHome(page);
  const hype = page.locator("button:has(svg.lucide-star)").first();
  if ((await hype.count()) === 0) {
    test.skip(true, "empty feed on the test account");
    return;
  }
  await expect(hype).toBeVisible();
  await expect(hype).toBeEnabled();
});

test("4. open a DM thread → composer visible", async ({ page }) => {
  await signIn(page);
  await page.goto("/messages");
  // A real conversation row, not the header's "New message" (/messages/new) link.
  const firstThread = page.locator('a[href^="/messages/"]:not([href="/messages/new"])').first();
  await firstThread.waitFor({ timeout: 90_000 }).catch(() => {});
  if ((await firstThread.count()) === 0) {
    test.skip(true, "no conversations on the test account");
    return;
  }
  await firstThread.click();
  await expect(page.getByPlaceholder("Message…")).toBeVisible({ timeout: 60_000 });
});

test("5. block action reachable from a profile (dialog not confirmed)", async ({ page }) => {
  await signIn(page);
  await page.goto("/u/amankabhailavi");
  // The profile ⋯ actions button (aria-labelled). Skip if this profile lacks one.
  const more = page.locator('button[aria-label*="ption" i], button[aria-label*="ore" i]').first();
  await more.waitFor({ timeout: 90_000 }).catch(() => {});
  if ((await more.count()) === 0) {
    test.skip(true, "no actions menu on this profile");
    return;
  }
  await more.click();
  // Block should be offered; we assert it exists, we do NOT confirm.
  await expect(page.getByText(/^Block/i).first()).toBeVisible({ timeout: 15_000 });
});
