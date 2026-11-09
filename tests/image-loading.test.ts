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
const hosts = read("src/lib/image-hosts.ts");
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
