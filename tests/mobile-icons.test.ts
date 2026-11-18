import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ICONS } from "../apps/mobile/src/icon-map";
import { PHOSPHOR_PATHS, PHOSPHOR_VIEW_BOX } from "../apps/mobile/src/phosphor-paths";
import { extract, PHOSPHOR_VIEW_BOX as SOURCE_VIEW_BOX } from "../scripts/phosphor-extract.mjs";
import { ICONS as GENERATED_ICONS } from "../scripts/phosphor-extract.mjs";

/**
 * The phone draws the same icons the website does.
 *
 * Not "similar to" — the same path data and the same library version. The
 * instruction is that the app should not be distinguishable from
 * app.hypefy.chat, and an icon set is the most visible place a port gives
 * itself away: silhouettes that are nearly right read as a knock-off even
 * when every colour and measurement matches.
 *
 * So these assertions are pinned to the WEB's source, not to a list
 * retyped here. Change the icon on the website and this fails until the
 * phone follows.
 */

function web(path: string): string {
  // Comments stripped. Seven times in this repo a comment has satisfied an
  // assertion meant to read code.
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("the committed Phosphor paths match the package", () => {
  it("every icon and weight is byte-identical to a fresh extraction", async () => {
    /*
     * The copy is the risk. @phosphor-icons/react is a React DOM package
     * and cannot be imported from the native bundle, so the geometry is
     * copied across that boundary once by scripts/gen-phosphor-paths.mjs.
     * A copy with nothing checking it is a copy that goes stale: bump
     * Phosphor, the website's icons change, the phone keeps drawing last
     * version's, and nothing says so.
     *
     * Re-running the extraction here is what makes the copy safe.
     */
    // The icon list comes from a .mjs and so arrives untyped; the shape is
    // asserted rather than assumed, which also means a name added there
    // and not regenerated here fails on the lookup instead of on `{}`.
    for (const icon of GENERATED_ICONS as string[]) {
      const committed = (PHOSPHOR_PATHS as Record<string, Record<string, readonly string[]>>)[
        icon
      ];
      expect(committed, `${icon} is in the icon list but not in phosphor-paths.ts`).toBeTruthy();

      const fresh = (await extract(icon)) as Record<string, readonly string[]>;
      for (const weight of ["fill", "regular"]) {
        expect(
          committed[weight],
          `${icon}/${weight} has drifted — run: node scripts/gen-phosphor-paths.mjs`,
        ).toEqual(fresh[weight]);
      }
    }
  });

  it("and the grid they are drawn on travels with them", () => {
    // Phosphor is 256, Lucide is 24. A path on the wrong viewBox renders
    // as a blob or as nothing, and both are easy to ship.
    expect(PHOSPHOR_VIEW_BOX).toBe(SOURCE_VIEW_BOX);
    expect(PHOSPHOR_VIEW_BOX).toBe("0 0 256 256");
  });

  it("no path is empty", () => {
    for (const [icon, weights] of Object.entries(PHOSPHOR_PATHS)) {
      for (const [weight, paths] of Object.entries(weights)) {
        expect(paths.length, `${icon}/${weight}`).toBeGreaterThan(0);
        for (const d of paths) expect(d.startsWith("M"), `${icon}/${weight}`).toBe(true);
      }
    }
  });
});

describe("the tabs use the icons the website's bottom bar uses", () => {
  const bottomNav = () => web("src/components/layout/BottomNav.tsx");

  it("Home is House, Shots is Lightning, Messages is Chat", () => {
    /*
     * Read off the web rather than restated. BottomNav passes `Icon={X}`
     * for Home and Shots and renders <Chat> inline for Messages, so each
     * is checked in the form it actually appears in.
     */
    const src = bottomNav();
    expect(src).toMatch(/Icon=\{House\}/);
    expect(src).toMatch(/Icon=\{Lightning\}/);
    expect(src).toMatch(/<Chat\b/);

    expect(ICONS["/home"]).toEqual({ kind: "phosphor", name: "House" });
    expect(ICONS["/shots"]).toEqual({ kind: "phosphor", name: "Lightning" });
    expect(ICONS["/messages"]).toEqual({ kind: "phosphor", name: "Chat" });
  });

  it("and they come from Phosphor on both sides", () => {
    expect(bottomNav()).toMatch(/from "@phosphor-icons\/react"/);
  });

  it("Profile is the viewer's avatar on the web, so it is not an icon here", () => {
    // The web renders <Avatar>, not a glyph. Recording that as "avatar"
    // keeps the slot visibly unfinished instead of quietly substituting a
    // person icon the website never shows.
    expect(bottomNav()).toMatch(/<Avatar\b/);
    expect(ICONS["/profile"]).toEqual({ kind: "avatar" });
  });

  it("active is filled and inactive is not, as the web decides it", () => {
    const src = bottomNav();
    expect(src).toMatch(/weight=\{\s*active\s*\?\s*"fill"\s*:\s*"regular"\s*\}/);
    // Both weights are therefore the ones that must be bundled.
    for (const icon of GENERATED_ICONS) {
      const entry = PHOSPHOR_PATHS[icon as keyof typeof PHOSPHOR_PATHS];
      expect(Object.keys(entry).sort()).toEqual(["fill", "regular"]);
    }
  });
});

describe("the compass is the website's compass", () => {
  it("Lucide on both sides", () => {
    const topBar = web("src/components/layout/TopBar.tsx");
    expect(topBar).toMatch(/from "lucide-react"/);
    expect(topBar).toMatch(/<Compass\b/);
    expect(ICONS["/discover"]).toEqual({ kind: "lucide", name: "Compass" });
  });

  it("at the same stroke width", () => {
    const topBar = web("src/components/layout/TopBar.tsx");
    const m = topBar.match(/<Compass[^>]*strokeWidth=\{([\d.]+)\}/);
    expect(m, "the web's Compass no longer declares a strokeWidth").toBeTruthy();
    expect(web("apps/mobile/src/icons.tsx")).toContain(`LUCIDE_STROKE = ${m?.[1]}`);
  });

  it("and from the same version of Lucide, or the geometry can differ", () => {
    /*
     * The whole claim rests on this. Lucide reshapes icons between
     * versions, so "same library" is not "same shape" unless it is also
     * the same release. The web's range and the app's must agree.
     */
    const root = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    const mobile = JSON.parse(readFileSync("apps/mobile/package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    const webRange = root.dependencies["lucide-react"];
    const nativeRange = mobile.dependencies["lucide-react-native"];
    expect(webRange, "the web no longer depends on lucide-react").toBeTruthy();
    expect(nativeRange, "the app no longer depends on lucide-react-native").toBeTruthy();
    expect(nativeRange).toBe(webRange);
  });
});

describe("nothing is drawn with a stand-in any more", () => {
  it("Ionicons are gone from the app", () => {
    /*
     * The shell shipped with Ionicons because they need no native module.
     * They were the right silhouettes and the wrong shapes, which is
     * exactly the kind of difference the instruction rules out. This
     * fails if one comes back.
     */
    for (const file of ["apps/mobile/src/icons.tsx", "apps/mobile/src/icon-map.ts"]) {
      expect(web(file), `${file} still references Ionicons`).not.toMatch(/Ionicons/);
    }
    const pkg = JSON.parse(readFileSync("apps/mobile/package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies)).toContain("lucide-react-native");
    expect(Object.keys(pkg.dependencies)).toContain("react-native-svg");
  });
});
