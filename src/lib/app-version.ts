/**
 * Picking up a new release in a page that's already open.
 *
 * The Android app keeps its page — and the code that page loaded — alive for
 * days. A refresh fetches new data but runs it through the old code, so a fix
 * that's already live didn't show until the app was fully closed. The page
 * knows which build it was loaded from; when the server is on a newer one,
 * a full reload brings the new code in.
 */

/** The build this page's code came from (set at build time in next.config). */
export const LOADED_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export function isNewerBuild(server: string | null | undefined, loaded: string): boolean {
  return !!server && server !== "dev" && loaded !== "dev" && server !== loaded;
}

/** Reload the page if a newer build is live. Returns true when it reloads. */
export async function reloadIfNewBuild(): Promise<boolean> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return false;
    const { build } = (await res.json()) as { build?: string };
    if (!isNewerBuild(build, LOADED_BUILD)) return false;
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
