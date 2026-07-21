import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Runs against a local dev server on :3000 (reuses one if already
 * up). Tests are non-destructive — they exercise the five core flows up to,
 * but not committing, writes — so the suite is safe to re-run against the
 * shared Supabase project. Credentials come from env (see tests/e2e/auth).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // The dev filesystem is slow; cold route compiles occasionally time a
  // navigation out. Retries absorb that transient flake.
  retries: 2,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    // The app kills animations under reduced-motion — keeps elements "stable"
    // for actionability checks (the auth page has a looping background beam).
    reducedMotion: "reduce",
    // Dev filesystem is slow; cold routes compile for a while on first hit.
    actionTimeout: 20_000,
    navigationTimeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
