import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { canOptimize } from "@/lib/image-hosts";

/**
 * Pictures, at the size they are actually shown.
 *
 * Avatars were a raw <img> pointed straight at the upload, and
 * ImageCropper writes those at 1080px — so a feed screen with fifteen
 * faces pulled fifteen full-resolution photographs to paint them into
 * 40px boxes, none of them deferred. 125 call sites, one file.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const avatar = read("src/components/ui/Avatar.tsx");
const optimized = read("src/components/ui/OptimizedImage.tsx");
const nextConfig = read("next.config.ts");
const feedCard = read("src/components/feed/FeedCard.tsx");

describe("which hosts next/image may touch", () => {
  it("is decided in one place, not two", () => {
    // next/image throws at runtime for an un-configured host, so every
    // caller has to ask. A second copy is the kind that quietly stops
    // matching next.config.
    expect(optimized).toContain('import { canOptimize } from "@/lib/image-hosts";');
    expect(avatar).toContain('import { canOptimize } from "@/lib/image-hosts";');
    expect(optimized).not.toContain("const OPTIMIZABLE_HOSTS");
  });

  it("and the list matches what next.config actually allows", () => {
    const configured = [...nextConfig.matchAll(/hostname:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(configured.length).toBeGreaterThan(0);
    for (const host of configured) {
      expect(canOptimize(`https://${host}/storage/v1/object/public/x.jpg`), host).toBe(true);
    }
  });

  it("local and data URLs are always safe; an unknown host is not", () => {
    expect(canOptimize("/onboarding/maya.webp")).toBe(true);
    expect(canOptimize("data:image/png;base64,iVBOR")).toBe(true);
    expect(canOptimize("https://lh3.googleusercontent.com/a/x")).toBe(false);
    expect(canOptimize("not a url")).toBe(false);
  });
});

describe("an avatar downloads at the size it is drawn", () => {
  it("it goes through next/image", () => {
    expect(avatar).toContain('import Image from "next/image";');
    expect(avatar).toContain("<Image");
    expect(avatar).toContain("width={size}");
    expect(avatar).toContain("height={size}");
  });

  it("with a sizes hint in pixels, not a viewport ladder", () => {
    // A 40px box has no use for the full responsive candidate set.
    expect(avatar).toContain("sizes={`${size}px`}");
  });

  it("an un-optimisable host still renders, and still defers", () => {
    // next/image throws on those; it must never see one.
    const fallback = avatar.slice(avatar.indexOf("// An unexpected host"));
    expect(fallback).toContain('loading="lazy"');
    expect(fallback).toContain('decoding="async"');
  });

  it("and it stays a Server Component", () => {
    // Routing it through OptimizedImage would have worked, but that is
    // a Client Component with load state — 125 client islands to save
    // some bytes is trading one cost for another.
    expect(avatar.startsWith('"use client"')).toBe(false);
  });
});

describe("sheets nobody opened are not in the card's chunk", () => {
  it("both are dynamically imported", () => {
    for (const name of ["CommentsSheet", "ShareSheet"]) {
      expect(feedCard, name).toContain(`const ${name} = dynamic(`);
    }
    expect(feedCard).toContain('import dynamic from "next/dynamic";');
  });

  it("and mounting waits for the first open", () => {
    // dynamic() fetches when the component first renders, so leaving
    // them mounted with open={false} would have loaded the chunk
    // anyway — the gate is what makes the split do anything.
    expect(feedCard).toContain("{commentsUsed && (");
    expect(feedCard).toContain("{shareUsed && (");
  });

  it("but stays mounted afterwards, so closing can animate", () => {
    expect(feedCard).toContain("function openComments() {");
    expect(feedCard).toContain("setCommentsUsed(true);");
    expect(feedCard).not.toContain("setCommentsUsed(false)");
    expect(feedCard).not.toContain("setShareUsed(false)");
  });

  it("every opener goes through the helpers", () => {
    // One missed caller and that sheet never mounts at all.
    expect(feedCard).not.toContain("setCommentsOpen(true)}");
    expect(feedCard).not.toContain("setShareOpen(true)}");
  });
});

describe("no raw <img> creeps back into the avatar path", () => {
  it("Avatar is the only place faces are drawn", () => {
    // Not a repo-wide <img> ban — plenty of legitimate uses remain.
    // This is specifically about avatars regressing to a raw tag.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) return walk(full);
        return /\.tsx$/.test(e.name) ? [full] : [];
      });
    const offenders = walk("src").filter((f: string) => {
      const src = read(f);
      return /<img[^>]+avatar_url/i.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

describe("the heavy screens behind the camera are split out", () => {
  const create = read("src/components/create/CreateScreen.tsx");

  it("all three are dynamic", () => {
    for (const name of ["TrackPicker", "ShowEditor", "ShotEditor"]) {
      expect(create, name).toContain(`const ${name} = dynamic(`);
      expect(create, name).not.toContain(`import { ${name} }`);
    }
  });

  it("and each was already rendered conditionally, so nothing changes behaviour", () => {
    // dynamic() fetches on first render, so a component mounted
    // unconditionally would load its chunk anyway.
    expect(create).toContain("const songPicker = trackOpen ? (");
    expect(create).toContain('if (captured && mode !== "show" && !captioning) {');
    expect(create).toContain('if (captured && mode === "show" && !isVideoFile(captured) && arranged === null) {');
  });
});

describe("the feed cards stop re-rendering on every append", () => {
  const feedCard = read("src/components/feed/FeedCard.tsx");
  const shotCard = read("src/components/feed/ShotFeedCard.tsx");

  it("both are memoised", () => {
    expect(feedCard).toContain("export const FeedCard = memo(FeedCardInner);");
    expect(shotCard).toContain("export const ShotFeedCard = memo(ShotFeedCardInner);");
  });

  it("and the feed passes them only data, so a shallow compare is enough", () => {
    // An inline arrow in any of these props would defeat the memo on
    // every render.
    const list = read("src/components/feed/FeedList.tsx");
    const block = list.slice(list.indexOf("<ShotFeedCard"), list.indexOf("{/* Sentinel"));
    expect(block).not.toContain("={() =>");
    expect(block).not.toContain("={async");
  });
});

describe("icon barrels", () => {
  const config = read("next.config.ts");

  it("phosphor is named, because Next does not optimise it by default", () => {
    expect(config).toContain('optimizePackageImports: ["@phosphor-icons/react"]');
  });

  it("and lucide is not, because Next already does", () => {
    // It is in Next's own built-in list; naming it here changes
    // nothing and reads as though it were doing something.
    expect(config).not.toContain('"lucide-react"');
  });
});

describe("onboarding stops shipping 2 MB eagerly", () => {
  const intro = read("src/components/onboarding/IntroCarousel.tsx");

  it("every image in the carousel still defers", () => {
    // next/image is lazy unless told otherwise, so what this guards
    // is that nobody marks one `priority` — there is no LCP image on
    // this screen worth making eager, and twelve eager ones would
    // undo the point.
    expect(intro).not.toContain("priority");
  });
});

describe("the onboarding carousel is resized, not just deferred", () => {
  const intro = read("src/components/onboarding/IntroCarousel.tsx");

  /**
   * Deferring alone turned out to achieve little here: the carousel
   * keeps every slide mounted and positioned nearby, so the browser
   * fetched all of them anyway — confirmed in a real browser, where
   * all twelve requests fired on slide one. Resizing is the actual
   * win. Measured against the dev optimiser: 1,303 KB of source
   * became 361 KB served, a 72% cut, with maya.webp going from 138 KB
   * to 4.5 KB.
   */
  it("no raw <img> is left in it", () => {
    expect(intro).not.toContain("<img");
    expect(intro).toContain('import Image from "next/image";');
  });

  it("and no orphaned lint suppressions either", () => {
    // Each <img> carried an eslint-disable for no-img-element; with
    // the tags gone those became unused directives, which lint counts.
    expect(intro).not.toContain("no-img-element");
  });

  it("every image states the size it is actually drawn at", () => {
    // Without `sizes`, next/image generates the full viewport ladder
    // and the browser picks far too large for a 26px avatar. These
    // values came from measuring the rendered boxes in a browser.
    const images = intro.match(/<Image /g) ?? [];
    const sized = intro.match(/sizes="\d+px"/g) ?? [];
    expect(images).toHaveLength(12);
    expect(sized).toHaveLength(12);
  });

  it("and none of them asks for more than the layout can use", () => {
    // The largest box anywhere in the carousel measured 314px; the
    // device pixel ratio is applied on top of `sizes`, so a value
    // much beyond that is just wasted bytes.
    const values = [...intro.matchAll(/sizes="(\d+)px"/g)].map((m) => Number(m[1]));
    expect(values.length).toBe(12);
    for (const v of values) expect(v).toBeLessThanOrEqual(384);
  });
});

describe("thumbnails in scrolling lists are deferred", () => {
  /**
   * Not a repo-wide `loading="lazy"` sweep — that was the plan, and most of
   * the ninety-one raw <img> tags in this repo should not have it. An image
   * only gains from deferring if it can be off-screen when it mounts, and a
   * good number of these are the opposite: the photo being edited, a
   * filmstrip of frames just captured from the user's own video, a Show's
   * embed while you are looking at it. Deferring those is a regression.
   *
   * So this pins the judgement rather than a count: the sixteen tags that sit
   * in scrolling lists defer, every one of them, and the ones that must paint
   * immediately still do not.
   */
  const tagsFor = (file: string, srcExpr: string) =>
    (read(file).match(/<img[\s\S]*?\/>/g) ?? []).filter((t) => t.includes(`src=${srcExpr}`));

  const deferred: ReadonlyArray<readonly [string, string, number]> = [
    ["src/app/(app)/notifications/page.tsx", "{g.thumb.url}", 1],
    // Was {cover(p)!} until Insights moved onto creator_item_stats, which
    // returns the cover already chosen rather than making the page derive
    // it from image_url/image_urls.
    ["src/app/(app)/profile/insights/page.tsx", "{p.cover}", 1],
    ["src/app/(app)/creator/page.tsx", "{best.cover}", 1],
    ["src/components/diary/DiaryArchiveSheet.tsx", "{page.imageUrl}", 1],
    // The blurred bed and the photo on top of it — same file, same source.
    ["src/components/diary/FriendDiaryCard.tsx", "{entry.imageUrl!}", 2],
    ["src/components/feed/ShareSheet.tsx", "{preview.thumb}", 1],
    ["src/components/music/TrackPicker.tsx", "{t.artwork}", 1],
    ["src/components/music/TrackPicker.tsx", "{art}", 1],
    ["src/components/post/ScheduledList.tsx", "{p.image}", 1],
    ["src/components/saved/SoundRow.tsx", "{track.artwork}", 1],
    ["src/components/shows/AlbumSheet.tsx", "{url}", 1],
    ["src/components/shows/CollabView.tsx", "{s.media_url}", 1],
    ["src/components/shows/ShowWidgetPickers.tsx", "{item.thumb}", 1],
    ["src/components/messages/SharedPostCard.tsx", "{image}", 1],
    ["src/components/messages/SharedShotCard.tsx", "{shot.poster_url}", 1],
  ];

  it.each(deferred)("%s defers %s", (file, srcExpr, count) => {
    const tags = tagsFor(file, srcExpr);
    // Without the count a renamed source would make this assert nothing.
    expect(tags, `<img src=${srcExpr}> in ${file}`).toHaveLength(count);
    for (const tag of tags) {
      expect(tag).toContain('loading="lazy"');
      expect(tag).toContain('decoding="async"');
    }
  });

  it("and nothing else quietly started deferring", () => {
    // Counted from the repo rather than from the list above, so this fails
    // both ways: a defer dropped, or one added without a thought about
    // whether that image can actually be off-screen. 20 sit outside the
    // named list below; the 16 named in it bring the total to 36.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) return walk(full);
        return /\.tsx$/.test(e.name) ? [full] : [];
      });
    const lazy = walk("src")
      .flatMap((f: string) => read(f).match(/<img[\s\S]*?\/>/g) ?? [])
      .filter((tag: string) => tag.includes('loading="lazy"'));
    expect(lazy).toHaveLength(36);
    expect(deferred.reduce((n, [, , c]) => n + c, 0)).toBe(16);
  });

  it("a chat image defers by default but lets its caller decide", () => {
    // ChatImg wraps every photo in a thread, and a thread scrolls a long
    // way. The attributes go before the spread so a caller that wants one
    // eager can still say so.
    expect(read("src/components/messages/ChatMedia.tsx")).toContain(
      '<img loading="lazy" decoding="async" {...rest}',
    );
  });

  it("but the picture you are looking at is not deferred", () => {
    const inView = [
      ["src/components/shows/ShowEditor.tsx", "{photoUrl}"],
      ["src/components/post/ShotTrimmer.tsx", "{f.url}"],
      ["src/components/post/PostPreview.tsx", "{imageUrls[0]}"],
    ] as const;
    for (const [file, srcExpr] of inView) {
      const tags = tagsFor(file, srcExpr);
      expect(tags, `<img src=${srcExpr}> in ${file}`).toHaveLength(1);
      expect(tags[0], file).not.toContain("loading=");
    }
  });
});
