import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Work that is cheap to do and compounds: round trips removed from in front
 * of the first byte, images asked for at the size they are drawn, and a
 * ceiling on the three tables that only ever grew.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("the signed-in user is asked for once per request", () => {
  const helper = read("src/lib/auth-user.ts");

  it("the helper is cached by the render, not by anything passed in", () => {
    // getUser() is an HTTP call to GoTrue, not a cookie read — that is the
    // point of it. There were three or four per page: the proxy, the layout,
    // getProfile inside it, and the page's own.
    expect(helper).toContain('import { cache } from "react";');
    expect(helper).toContain("export const currentUser = cache(");
  });

  it("every server page that had its own call now uses it", () => {
    const pages = [
      "src/app/(app)/layout.tsx",
      "src/app/(app)/profile/page.tsx",
      "src/app/(app)/settings/profile/page.tsx",
      "src/app/age-check/page.tsx",
      "src/app/onboarding/page.tsx",
      "src/app/page.tsx",
      "src/app/setup-profile/page.tsx",
    ];
    for (const p of pages) {
      const src = read(p);
      expect(src, p).toContain("const user = await currentUser();");
      expect(src, p).not.toContain("await supabase.auth.getUser()");
    }
  });

  it("and hands the user to getProfile rather than letting it ask again", () => {
    for (const p of [
      "src/app/(app)/layout.tsx",
      "src/app/(app)/profile/page.tsx",
      "src/app/(app)/settings/profile/page.tsx",
      "src/app/age-check/page.tsx",
      "src/app/onboarding/page.tsx",
      "src/app/page.tsx",
      "src/app/setup-profile/page.tsx",
    ]) {
      expect(read(p), p).toMatch(/getProfile\(supabase, user\)/);
    }
  });

  it("getProfile still works for a caller that has no user to give", () => {
    // It is imported by client components, which cannot reach the cached
    // helper — so the old behaviour has to survive, and an explicit null
    // must not be mistaken for "not supplied".
    const profile = read("src/lib/profile.ts");
    expect(profile).toContain("if (user === undefined) {");
    expect(profile).not.toContain('import { cache } from "react"');
  });
});

describe("the frame catalogue is asked for once, alongside everything else", () => {
  it("it is cached", () => {
    expect(read("src/lib/frames-load.ts")).toContain("export const loadFrames = cache(");
  });

  it("and it is in the layout's Promise.all, not awaited after it", () => {
    const layout = read("src/app/(app)/layout.tsx");
    const all = layout.slice(layout.indexOf("await Promise.all(["));
    expect(all.slice(0, 600)).toContain("loadFrames(),");
    expect(layout).toContain("<FrameCatalogProvider frames={frames}>");
  });
});

describe("images are asked for at the size they are drawn", () => {
  it("the profile and rehype grids no longer load full-size originals", () => {
    for (const p of ["src/components/profile/ProfileGrids.tsx", "src/components/profile/RehypesGrid.tsx"]) {
      const src = read(p);
      expect(src, p).toContain("OptimizedImage");
      // A tile is ~160 CSS px in a three-column grid inside a 480px shell.
      expect(src, p).toContain('sizes="(max-width: 480px) 33vw, 160px"');
      expect(src, p).not.toContain('className="h-full w-full object-cover" />');
    }
  });

  it("exactly one feed image is marked as the LCP", () => {
    const list = read("src/components/feed/FeedList.tsx");
    expect(list).toContain("priority={i === 0}");
    // The first card's FIRST photo — the rest of its gallery is off-screen.
    expect(read("src/components/feed/FeedCard.tsx")).toContain("priority={priority && i === 0}");
  });

  it("and the un-optimisable fallback honours it too", () => {
    // Otherwise an LCP image on a host next/image cannot touch is lazy.
    const img = read("src/components/ui/OptimizedImage.tsx");
    expect(img).toContain('loading={priority ? "eager" : "lazy"}');
    expect(img).toContain('fetchPriority={priority ? "high" : undefined}');
  });
});

describe("the font is one file", () => {
  it("no static weight list, so the variable face is used", () => {
    const layout = read("src/app/layout.tsx");
    const jakarta = layout.slice(layout.indexOf("const jakarta = Plus_Jakarta_Sans({"));
    expect(jakarta.slice(0, 900)).not.toMatch(/^\s*weight:/m);
  });
});

describe("the service worker does not stand in front of every navigation", () => {
  const sw = read("public/sw.js");

  it("navigation preload is enabled on activate", () => {
    expect(sw).toContain("self.registration.navigationPreload?.enable()");
  });

  it("and the fetch handler uses what was preloaded", () => {
    expect(sw).toContain("const preloaded = await event.preloadResponse;");
    expect(sw).toContain("if (preloaded) return preloaded;");
  });

  it("the offline fallback still works when the network is gone", () => {
    expect(sw).toContain("caches.match(OFFLINE_URL, { ignoreSearch: true })");
    expect(sw).toContain("return cached ?? Response.error();");
  });
});

describe("the three tables that only ever grew have a ceiling", () => {
  const sql = read("supabase/migrations/0154_retention.sql");

  it("views and read notifications age out", () => {
    expect(sql).toContain("delete from public.post_views");
    expect(sql).toContain("delete from public.shot_views");
    expect(sql).toContain("delete from public.notifications");
    expect(sql).toContain("keep_days constant int := 180;");
  });

  it("an unread notification is never deleted, at any age", () => {
    const notif = sql.slice(sql.indexOf("delete from public.notifications"));
    expect(notif).toContain("where is_read");
  });

  it("each run is capped, so a lapse is several short jobs not one long lock", () => {
    expect(sql).toContain("cap constant int := 20000;");
    expect(sql.match(/limit cap/g)?.length).toBe(3);
  });

  it("only cron can call it", () => {
    expect(sql).toContain("revoke all on function public.prune_retention() from public, anon, authenticated;");
    expect(sql).toContain("'prune-retention',");
  });

  it("it does not collide with the other nightly jobs", () => {
    // expire-lapsed-subscriptions runs at 03:15, prune-rate-events at 03:23.
    expect(sql).toContain("'40 3 * * *'");
  });
});
