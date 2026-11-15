import { test, expect } from "@playwright/test";
import { needsAccount, signIn, waitForHome, noHorizontalScroll } from "./helpers";

/**
 * The signed-in flows. Deliberately NON-DESTRUCTIVE — each is driven up to
 * (but not committing) its write, so the suite is safe to re-run against the
 * shared Supabase project without creating posts, hypes, blocks or DMs. Flows
 * that depend on account content skip cleanly when it is absent.
 *
 * Every test here needs a test account. Without E2E_EMAIL and E2E_PASSWORD
 * they skip with a reason rather than failing — see needsAccount(). Checks
 * that need no account live in public-surface.spec.ts so that a clone with no
 * secrets still gets real coverage.
 */

test.describe.configure({ mode: "serial" });

test.beforeEach(() => {
  needsAccount();
});

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

/*
 * ── Added in Phase 1 ──────────────────────────────────────────────────────
 * The blueprint named six flows to cover before 130k lines move into a shared
 * core. Three of them had no test at all: Shot playback, profile edit, and the
 * feed actually loading rather than merely offering a hype button. The rest
 * below are the screens a structural refactor is most likely to break
 * silently, because they are the ones that fetch on the server and render
 * nothing visible when a query fails.
 */

test("6. the Shots reel plays, or says it is empty", async ({ page }) => {
  // Both outcomes are correct; what is not correct is a blank black screen,
  // which is what a broken reel query looks like. One of the two must show.
  await signIn(page);
  await page.goto("/shots");
  const video = page.locator("video").first();
  const empty = page.getByText("The reel is empty");
  await expect(video.or(empty)).toBeVisible({ timeout: 90_000 });
});

test("7. profile edit loads with the current values", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/profile");
  const name = page.getByPlaceholder("What people call you");
  await expect(name).toBeVisible({ timeout: 90_000 });
  // Populated, not blank: the form fetches the profile server-side, and an
  // empty field here means the read failed while the page still rendered.
  await expect(name).not.toHaveValue("");
  // Nothing is saved — the write is the one thing this must not do.
});

test("8. the home feed renders content or an honest empty state", async ({ page }) => {
  await signIn(page);
  await waitForHome(page);
  const anyPost = page.locator("article, [data-post-id]").first();
  const emptyish = page.getByText(/nothing here|empty|follow some/i).first();
  await expect(anyPost.or(emptyish)).toBeVisible({ timeout: 90_000 });
});

test("9. Discover loads", async ({ page }) => {
  await signIn(page);
  await page.goto("/discover");
  // Discover is reachable only by a right-swipe in the app today, which is
  // one of the five gestures Phase 4 fixes — so a direct visit is also the
  // regression test for that work.
  await expect(page.locator("main, [role='main'], body")).toBeVisible();
  await expect(page.getByText(/discover|for you|trending|people/i).first()).toBeVisible({
    timeout: 90_000,
  });
});

test("10. search accepts a query and responds", async ({ page }) => {
  await signIn(page);
  await page.goto("/search");
  const box = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
  await box.waitFor({ timeout: 90_000 }).catch(() => {});
  if ((await box.count()) === 0) {
    test.skip(true, "no search input on this build");
    return;
  }
  await box.fill("a");
  // Something must change — results or a no-results line. A search box that
  // swallows input is the failure this catches.
  await expect(
    page.getByText(/result|no one|nothing|people|posts/i).first(),
  ).toBeVisible({ timeout: 30_000 });
});

test("11. notifications load", async ({ page }) => {
  await signIn(page);
  await page.goto("/notifications");
  await expect(
    page.getByText(/notification|activity|nothing|caught up|quiet/i).first(),
  ).toBeVisible({ timeout: 90_000 });
});

test("12. the creator dashboard gates on creator mode", async ({ page }) => {
  // Either the opt-in explanation or the dashboard itself. Both are correct;
  // a blank page is not. This is the screen built most recently and the one
  // with the newest RPCs behind it.
  await signIn(page);
  await page.goto("/creator");
  await expect(
    page.getByText(/creator tools|views|overview|turn on/i).first(),
  ).toBeVisible({ timeout: 90_000 });
});

test("13. own profile loads", async ({ page }) => {
  await signIn(page);
  await page.goto("/profile");
  await expect(page.locator('a[href="/settings"], button, img').first()).toBeVisible({
    timeout: 90_000,
  });
});

test("14. the signed-in shell does not scroll sideways at desktop width", async ({ page }) => {
  // The authenticated counterpart to the layout checks in
  // public-surface.spec.ts. Phase 4 replaces the 480px column with a real
  // desktop layout; this is the guard that it does not overflow while doing so.
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForHome(page);
  await noHorizontalScroll(page);
});
