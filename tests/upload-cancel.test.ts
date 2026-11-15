import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { UploadCancelled, isCancelled, worthRetrying } from "@/lib/upload-error";

/**
 * Stopping an upload, and not offering to retry one that cannot work.
 *
 * There was no way to stop an upload at all: a fifty-megabyte clip picked
 * by accident went up regardless, and the only way out was to let it
 * finish and delete the post afterwards.
 *
 * What cancelling can and cannot do is worth being exact about. The
 * storage client takes no AbortSignal on upload in this version — it has
 * one for download and not for this — so a request already in flight
 * finishes. Its object is then removed, and the row is never written. The
 * post never exists, which is what cancelling means here; it is not a
 * claim that the bytes stopped moving.
 *
 * And worthRetrying was written in the last change and wired to nothing —
 * exactly the state post-media.ts had been in for a month. It decides
 * whether the banner offers a Retry, because a retry on a file over the
 * bucket ceiling is a second identical failure dressed as a control.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const up = read("src/components/upload/UploadProvider.tsx");
const status = read("src/components/upload/UploadStatus.tsx");
const layout = read("src/app/(app)/layout.tsx");
const home = read("src/app/(app)/home/page.tsx");

describe("cancelling", () => {
  it("is its own kind of ending, not a failure", () => {
    const err = new UploadCancelled();
    expect(isCancelled(err)).toBe(true);
    expect(isCancelled(new Error("boom"))).toBe(false);
    expect(isCancelled(null)).toBe(false);
  });

  it("unwinds through the catch that already cleans up", () => {
    // The files go and the row is never written for free; only the
    // reporting differs.
    expect(up).toContain("throw new UploadCancelled()");
    expect((up.match(/if \(isCancelled\(err\)\) \{/g) ?? [])).toHaveLength(2);
  });

  it("leaves no banner offering to retry what was just stopped", () => {
    for (const m of up.matchAll(/if \(isCancelled\(err\)\) \{([\s\S]*?)\}/g)) {
      expect(m[1]).toContain("return;");
      expect(m[1]).not.toContain("setFailed");
    }
  });

  it("is checked between slots, which is the first moment it can be", () => {
    // Mid-file is not available: there is no signal to pass.
    expect(up).toContain("bailIfCancelled();");
    const loop = up.slice(up.indexOf("for (let i = 0; i < a.files.length; i++)"));
    expect(loop.slice(0, 400)).toContain("bailIfCancelled();");
  });

  it("and once more before the row is written", () => {
    // Past that point the post exists, and stopping would mean deleting
    // something published rather than never making it.
    const at = up.indexOf("// Last chance");
    expect(at).toBeGreaterThan(-1);
    expect(up.slice(at, at + 300)).toContain("bailIfCancelled();");
  });

  it("reads the flag from a ref, not from captured state", () => {
    // The upload loop is a closure that started before the button existed;
    // a state value it captured would stay false however many renders
    // happened afterwards.
    expect(up).toContain("const cancelled = useRef(false);");
    // Once per upload path, counted. A toContain passed while the post
    // path's reset was deleted, because the Shot path's was still there —
    // and a flag left true would cancel the NEXT upload instantly.
    expect((up.match(/cancelled\.current = false;/g) ?? [])).toHaveLength(2);
  });

  it("and the one surface that reports an upload offers it", () => {
    // This counted TWO, because there were two components: a bar at the top
    // of Home that drew nothing for a Shot, and a card above the navbar that
    // drew nothing for a post. Sharing a post and walking to another tab left
    // nothing on screen at all — still uploading, with no way to watch it,
    // cancel it, or learn that it had failed.
    //
    // One now, so one is the right count. The guarantees under it are the
    // stronger ones: nothing bails out by kind any more.
    expect((status.match(/onClick=\{cancelUpload\}/g) ?? [])).toHaveLength(1);
  });

  it("and that surface covers both kinds", () => {
    // The exact shape of the old bug: an early return keyed on the kind.
    expect(status).not.toContain('active === "shot"');
    expect(status).not.toContain('active !== "shot"');
    expect(status).toContain("const kind = failed?.kind ?? active;");
  });

  it("and neither of the two it replaced is left behind", () => {
    // A dead copy still exported is a dead copy somebody renders again.
    expect(up).not.toContain("UploadProgressBar");
    expect(up).not.toContain("ShotUploadCard");
    expect(home).not.toContain("UploadProgressBar");
  });

  it("rendered from the layout, so it survives walking to another tab", () => {
    // The whole point. Rendered by a page it disappears the moment you
    // navigate, which is exactly when a long upload is still running.
    expect(layout).toContain("<UploadStatus />");
  });
});

describe("the banner says what happened", () => {
  it("prints the reason rather than a literal of its own", () => {
    // It said "Couldn't share your post." whatever had happened, so the one
    // surface that stays on screen was the one that never told you
    // anything — the specific message was only ever in a toast.
    expect(status).toContain("{failed!.message}");
    expect(status).not.toContain("Couldn&apos;t share your post.");
    expect(status).not.toContain("Couldn&apos;t post your Shot.");
  });

  it("and only offers Retry where a retry could work", () => {
    expect((status.match(/\{failed!\.canRetry && \(/g) ?? [])).toHaveLength(1);
  });

  it("with worthRetrying actually deciding it", () => {
    // Written in the previous change and wired to nothing, which is the
    // state post-media.ts had been in for a month.
    expect((up.match(/canRetry: worthRetrying\(err\)/g) ?? [])).toHaveLength(2);
    expect(worthRetrying(new Error("Payload too large"))).toBe(false);
    expect(worthRetrying(new Error("Failed to fetch"))).toBe(true);
  });
});

describe("the status card sits off the bar's own height", () => {
  it("not a second copy of 72px", () => {
    // The last hardcoded copy. --nav-h and the things above it were two
    // numbers that disagreed by the gesture inset once already.
    expect(status).toContain("bottom-[calc(var(--nav-h)+var(--sab))]");
    expect(status).not.toContain("calc(72px");
  });

  it("and announces itself, since it can appear while you read another tab", () => {
    // The one case a screen reader user has no other way to learn about: an
    // upload that fails somewhere they are not looking.
    expect(status).toContain('role="status"');
    expect(status).toContain('aria-live="polite"');
    expect(status).toContain('role="progressbar"');
    expect(status).toContain("aria-valuenow={Math.round(progress ?? 0)}");
  });
});
