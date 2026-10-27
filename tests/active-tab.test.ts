import { describe, it, expect } from "vitest";
import { activeTab, tabOf, type Tab } from "@/lib/active-tab";
import { readFileSync } from "node:fs";

/**
 * Which tab the bar lights up.
 *
 * It used to read the path alone, so tapping a Shot in the home feed lit
 * the Shots tab — you had gone nowhere, but the bar said you had left
 * home. A Shot opened from the feed is still the feed; the Shots tab is a
 * different place you go on purpose.
 *
 * So the bar follows the last tab you actually stood on, and only reads
 * the path when there is no such thing — a shared link opened cold.
 */

describe("which tab a path belongs to", () => {
  it("knows the four roots", () => {
    expect(tabOf("/home")).toBe("home");
    expect(tabOf("/shots")).toBe("shots");
    expect(tabOf("/messages")).toBe("messages");
    expect(tabOf("/profile")).toBe("profile");
  });

  it("and everything under them", () => {
    expect(tabOf("/shots/abc")).toBe("shots");
    expect(tabOf("/messages/thread-1")).toBe("messages");
    expect(tabOf("/profile/edit")).toBe("profile");
  });

  it("but not a path that merely starts with the same letters", () => {
    // /shop is not /shots, and /homework is not /home.
    expect(tabOf("/shop")).toBeNull();
    expect(tabOf("/showcase")).toBeNull();
    expect(tabOf("/homework")).toBeNull();
  });

  it("and nothing for a page that is not under a tab at all", () => {
    expect(tabOf("/settings")).toBeNull();
    expect(tabOf("/p/abc")).toBeNull();
  });
});

describe("a Shot opened from the home feed", () => {
  it("leaves the home tab lit, because you have not left home", () => {
    expect(activeTab("/shots/abc", "home")).toBe("home");
  });

  it("and the Shots tab is still a place you can go on purpose", () => {
    expect(activeTab("/shots", "home")).toBe("shots");
  });

  it("opened from a profile, the profile tab stays lit", () => {
    // The same rule, for free: profile grids link to Shots too.
    expect(activeTab("/shots/abc", "profile")).toBe("profile");
  });
});

describe("arriving cold", () => {
  it("a shared Shot link with no tab behind it lights Shots", () => {
    // Nowhere to go back to, so the path is all there is to go on.
    expect(activeTab("/shots/abc", null)).toBe("shots");
  });

  it("a shared thread link lights Messages", () => {
    expect(activeTab("/messages/t1", null)).toBe("messages");
  });

  it("and a page under no tab lights nothing", () => {
    expect(activeTab("/settings", null)).toBeNull();
  });
});

describe("standing on a tab root", () => {
  it("is always that tab, whatever came before", () => {
    // Otherwise tapping Shots from home would leave home lit.
    const roots: [string, Tab][] = [
      ["/home", "home"],
      ["/shots", "shots"],
      ["/messages", "messages"],
      ["/profile", "profile"],
    ];
    for (const [path, tab] of roots) {
      for (const from of ["home", "shots", "messages", "profile", null] as const) {
        expect(activeTab(path, from), `${path} from ${from}`).toBe(tab);
      }
    }
  });
});

describe("a page under no tab, with a tab behind it", () => {
  it("keeps that tab lit rather than going dark", () => {
    // Opening settings from your profile should not blank the bar.
    expect(activeTab("/settings", "profile")).toBe("profile");
  });
});

describe("the bar is wired to it", () => {
  const nav = readFileSync("src/components/layout/BottomNav.tsx", "utf8").replace(/\r\n/g, "\n");

  it("no tab reads the path on its own any more", () => {
    // startsWith("/shots") is the bug: it cannot tell a Shot you opened
    // from the feed from the Shots tab you went to on purpose.
    expect(nav).not.toContain('pathname.startsWith("/shots")');
    expect(nav).not.toContain('pathname.startsWith("/home")');
    expect(nav).not.toContain('pathname.startsWith("/profile")');
    expect(nav).not.toContain('pathname.startsWith("/messages")');
  });

  it("all four ask the same question", () => {
    for (const tab of ["home", "shots", "messages", "profile"]) {
      expect(nav, tab).toContain(`here === "${tab}"`);
    }
  });

  it("and it is settled during the render, not after it", () => {
    // In an effect the bar would light the wrong tab for a frame on every
    // navigation, which is the thing being fixed.
    expect(nav).toContain("if (seen.path !== pathname) {");
    expect(nav).toContain("const here = activeTab(pathname, from);");
  });

  it("the roots it remembers are the ones the library defines", () => {
    // A second copy of the list in the component is how the two drift.
    expect(nav).toContain("isTabRoot(pathname)");
    expect(nav).not.toContain('pathname === "/home" ||');
  });
});
