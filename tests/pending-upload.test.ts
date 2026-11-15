import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * An upload that was still going when the app went away.
 *
 * Nothing survived a reload. Close the app mid-upload — or let the WebView
 * be reclaimed, which a phone does to a backgrounded app all the time —
 * and the Files went with the page, so the work went too. The retry banner
 * only ever existed for the length of one session.
 *
 * The payload is kept in IndexedDB, beside the drafts, because it holds
 * Files and nothing else will.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const pending = read("src/lib/pending-upload.ts");
const drafts = read("src/lib/creation-drafts.ts");
const up = read("src/components/upload/UploadProvider.tsx");

describe("the two stores share a database and must agree about it", () => {
  it("both open it at the same version", () => {
    // indexedDB.open with a version lower than the one on disk fails
    // outright. If one file bumped and the other did not, whichever
    // opened second would get null and its feature would stop working
    // with no error anywhere.
    const v = (s: string) => s.match(/const DB_VERSION = (\d+);/)?.[1];
    expect(v(pending)).toBeDefined();
    expect(v(drafts)).toBe(v(pending));
  });

  it("and it is the same database", () => {
    const name = (s: string) => s.match(/const DB = "([^"]+)"/)?.[1];
    expect(name(drafts)).toBe(name(pending));
  });

  it("each upgrade creates both stores, since either may trigger it", () => {
    for (const [label, src] of [["drafts", drafts], ["pending", pending]] as const) {
      const fn = src.slice(src.indexOf("onupgradeneeded"), src.indexOf("onsuccess"));
      // Two stores created, however each file spells the names — drafts
      // uses constants, so matching the literals only worked on one side.
      expect((fn.match(/createObjectStore\(/g) ?? []), label).toHaveLength(2);
      // And both names are known to both files.
      expect(src, `${label} knows drafts`).toContain('"drafts"');
      expect(src, `${label} knows pending-upload`).toContain('"pending-upload"');
    }
  });

  it("and nothing ever throws out of either", () => {
    // A private window or a WebView with storage off means "not
    // available", never an error in front of somebody who was posting.
    for (const [label, src] of [["drafts", drafts], ["pending", pending]] as const) {
      expect(src, label).toContain("catch");
      expect(src, label).toContain("onerror");
    }
  });
});

describe("remembered before, forgotten after", () => {
  it("written down before a byte goes", () => {
    // Both paths, before their first upload call.
    // The live form, not the bare name: `void 0 && keepPending(...)` still
    // contains "keepPending(" and still sits before the upload.
    const post = up.slice(up.indexOf("const uploadPost = useCallback"));
    const postKeep = post.indexOf("void keepPending({");
    expect(postKeep).toBeGreaterThan(-1);
    expect(postKeep).toBeLessThan(post.indexOf('.from("post-images")'));

    const shot = up.slice(up.indexOf("const uploadShot = useCallback"));
    const shotKeep = shot.indexOf("void keepPending({");
    expect(shotKeep).toBeGreaterThan(-1);
    expect(shotKeep).toBeLessThan(shot.indexOf('.from("shot-media")'));
  });

  it("not awaited, because an upload should not wait on a disk", () => {
    // Counted, one per path. A toContain passed while the post call had
    // been gutted, because the Shot one still matched.
    expect((up.match(/void keepPending\(\{/g) ?? [])).toHaveLength(2);
  });

  it("and cleared on every way an upload can end", () => {
    // Published, scheduled, cancelled, and dismissed. A record that
    // outlives its upload is a banner offering to re-post something that
    // is already posted.
    // Exactly six: post published, post cancelled, Shot scheduled, Shot
    // published, Shot cancelled, and dismissed. An at-least check passed
    // while one of them was deleted.
    expect((up.match(/void clearPending\(\)/g) ?? [])).toHaveLength(6);
  });

  it("including dismissing, which is a decision and not a postponement", () => {
    const fn = up.slice(up.indexOf("const dismissFailed = useCallback"));
    expect(fn.slice(0, 400)).toContain("void clearPending()");
  });

  it("and cancelling", () => {
    for (const m of up.matchAll(/if \(isCancelled\(err\)\) \{([\s\S]*?)\}/g)) {
      expect(m[1]).toContain("void clearPending()");
    }
  });
});

describe("it asks rather than resuming", () => {
  it("restores as a banner with a retry, not as a send", () => {
    // The row is written at the END of an upload and the record cleared
    // straight after, so there is a window of milliseconds where the post
    // exists and the record survives. Auto-resuming would post it twice.
    const fn = up.slice(up.indexOf("void readPending(userId)"));
    const body = fn.slice(0, 1200);
    expect(body).toContain("setFailed({");
    expect(body).not.toContain("uploadPost(");
    expect(body).not.toContain("uploadShot(");
  });

  it("and never talks over an upload that is already running", () => {
    const fn = up.slice(up.indexOf("void readPending(userId)"));
    expect(fn.slice(0, 600)).toContain("progressRef.current !== null");
  });

  it("the banner says what happened rather than claiming a failure", () => {
    expect(up).toMatch(/didn.t finish/);
  });
});

describe("whose it is", () => {
  it("a pending upload belongs to one account", () => {
    // More than one person can use the same device.
    expect(pending).toContain("found.userId === userId");
  });

  it("and the provider is told which", () => {
    expect(up).toContain("userId: string;");
    expect(read("src/app/(app)/layout.tsx")).toContain("<UploadProvider userId={user!.id}>");
  });
});
