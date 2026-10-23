import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The published complaint mechanism.
 *
 * Rule 3(2)(a) of the Information Technology (Intermediary Guidelines and
 * Digital Media Ethics Code) Rules, 2021 asks an intermediary to publish the
 * Grievance Officer's name and contact details and the mechanism for making a
 * complaint — prominently. The details existed, in section 14 of the Privacy
 * Policy, which is "we told you" rather than "published". Intermediary safe
 * harbour turns on getting this right, so the parts that matter are pinned
 * here: the officer is named, the statutory timeframes are stated, and the
 * page is reachable from the app and from the sitemap.
 *
 * Nothing here is a legal opinion. It checks that what was decided is still
 * what is on the page.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/(legal)/grievance/page.tsx");

describe("the officer is named and reachable", () => {
  it("name, email and postal address are all on the page", () => {
    // A contact point with no name is not a contact point.
    expect(page).toContain("Mohd Aman");
    expect(page).toContain("grievance@hypefy.chat");
    expect(page).toContain("Moradabad, Uttar Pradesh 244001, India");
  });

  it("and the Privacy Policy points here rather than being the only home", () => {
    const privacy = read("src/app/(legal)/privacy/page.tsx");
    expect(privacy).toContain('href="/grievance"');
    // The details stay there too — people do look there.
    expect(privacy).toContain("Mohd Aman");
  });
});

describe("the timeframes are the statutory ones", () => {
  it("states all four", () => {
    // 24h to acknowledge, 15 days to resolve (Rule 3(2)(a)); 24h for the
    // nudity/impersonation category; 36h on a court or agency order
    // (Rule 3(1)(d)); 72h for lawful information requests (Rule 3(1)(j)).
    for (const phrase of [
      "Acknowledged within 24 hours",
      "Resolved within 15 days",
      "Within 36 hours",
      "Within 72 hours",
    ]) {
      expect(page, phrase).toContain(phrase);
    }
  });

  it("names the category that gets the fastest treatment", () => {
    expect(page).toContain("private area");
    expect(page).toContain("impersonation");
  });

  it("promises to say something when 15 days will not be met", () => {
    // A deadline with no escape hatch gets quietly missed instead of
    // explained, which is worse for the person waiting.
    expect(page).toContain("we will tell you why and when to expect an answer");
  });
});

describe("it describes machinery that exists", () => {
  it("points at the in-app report flow as the fast route", () => {
    expect(page).toContain("Report");
    // Which writes to `reports` and lands in the admin queue.
    expect(read("src/components/ui/ReportSheet.tsx")).toContain('from("reports")');
    expect(() => read("src/app/(app)/admin/reports/page.tsx")).not.toThrow();
  });

  it("offers an appeal to someone other than the original decider", () => {
    expect(page).toContain("did not make the original decision");
  });
});

describe("it is actually published", () => {
  it("is linked from every place the other legal pages are", () => {
    for (const f of [
      "src/app/(app)/help/page.tsx",
      "src/app/(app)/settings/page.tsx",
      "src/app/(app)/explore/page.tsx",
    ]) {
      expect(read(f), f).toContain('href="/grievance"');
    }
  });

  it("is in the sitemap", () => {
    expect(read("src/app/sitemap.ts")).toContain("/grievance");
  });

  it("is reachable without signing in", () => {
    // The middleware gates by an allowlist of protected prefixes; a legal
    // page must not be one of them.
    const mw = read("src/lib/supabase/middleware.ts");
    const list = mw.slice(mw.indexOf("protectedPrefixes"), mw.indexOf("const { pathname }"));
    expect(list).not.toContain("/grievance");
  });
});

describe("page titles are not doubled", () => {
  it("no page appends the suffix the root template already adds", () => {
    // The root layout sets template: "%s · Hypefy". Five legal pages wrote
    // "· Hypefy" themselves and rendered as "Terms of Service · Hypefy ·
    // Hypefy" — seen in the browser, not inferred.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(full);
        else if (e.name === "page.tsx" && /title:\s*"[^"]*· Hypefy"/.test(read(full))) {
          offenders.push(full);
        }
      }
    };
    walk("src/app");
    expect(offenders).toEqual([]);
  });
});
