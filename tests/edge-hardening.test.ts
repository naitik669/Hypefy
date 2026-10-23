import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isPushEndpointAllowed, secretMatches } from "@/lib/api-guard";

/**
 * Batch 3c: the ways in that were not through the front door — a URL that
 * skipped the proxy, a bucket you could index, a push endpoint pointing
 * anywhere, and two secrets compared with `!==`.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("the proxy cannot be skipped by naming a path cleverly", () => {
  /**
   * Compiled from the source rather than copied, because the bug was in the
   * gap between the two: `\.` in a TypeScript string is just `.`, so a
   * matcher that LOOKS escaped can still match any character. Reading the
   * literal would pass while the running app stayed broken.
   */
  const matcher = (() => {
    const src = read("src/proxy.ts");
    const literal = /"(\/\(\(\?!.*?)",/.exec(src)![1];
    return new RegExp("^" + (JSON.parse(`"${literal}"`) as string));
  })();

  it("a path that merely ends in image letters is still proxied", () => {
    // Each of these skipped the proxy — and with it the invite gate, the
    // session refresh and the two-factor redirect. /tag/[tag] is a path any
    // visitor chooses.
    for (const p of ["/tag/xpng", "/api/oneshot/abc-png", "/messages/1jpg", "/tag/awebp"]) {
      expect(matcher.test(p), p).toBe(true);
    }
  });

  it("ordinary pages are still proxied", () => {
    for (const p of ["/home", "/u/alice", "/messages", "/settings"]) expect(matcher.test(p), p).toBe(true);
  });

  it("real static assets are still skipped", () => {
    for (const p of ["/logo.png", "/icon.svg", "/favicon.ico", "/shot.jpeg"]) {
      expect(matcher.test(p), p).toBe(false);
    }
  });
});

describe("secrets are compared properly", () => {
  it("an unset or empty secret never matches", () => {
    // `!==` left this open: with the variable set to "", a caller sending an
    // empty header matched it. A cleared cron secret must fail closed.
    expect(secretMatches("anything", undefined)).toBe(false);
    expect(secretMatches("anything", "")).toBe(false);
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches(null, "")).toBe(false);
  });

  it("a missing header never matches", () => {
    expect(secretMatches(null, "s3cret")).toBe(false);
  });

  it("the right secret matches and a wrong one does not", () => {
    expect(secretMatches("s3cret", "s3cret")).toBe(true);
    expect(secretMatches("s3cres", "s3cret")).toBe(false);
    expect(secretMatches("s3cret-longer", "s3cret")).toBe(false);
  });

  it("both cron endpoints use it", () => {
    expect(read("src/app/api/push/route.ts")).toContain(
      'secretMatches(req.headers.get("x-push-secret"), process.env.PUSH_WEBHOOK_SECRET)',
    );
    expect(read("src/app/api/oneshot/reap/route.ts")).toContain(
      'secretMatches(req.headers.get("x-oneshot-reap-secret"), process.env.ONESHOT_REAP_SECRET)',
    );
  });
});

describe("push only goes to a real push service", () => {
  it("the known services are allowed", () => {
    for (const e of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://xyz.notify.windows.com/w/?token=abc",
    ]) {
      expect(isPushEndpointAllowed(e), e).toBe(true);
    }
  });

  it("anywhere else is not", () => {
    // push_subscriptions rows are written by the client and checked only for
    // user_id, so without this the server would POST wherever they said.
    for (const e of [
      "https://attacker.example/collect",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.attacker.example/x",
      "not a url",
      "",
    ]) {
      expect(isPushEndpointAllowed(e), e).toBe(false);
    }
  });

  it("the route checks before it sends", () => {
    expect(read("src/app/api/push/route.ts")).toContain("if (!isPushEndpointAllowed(sub.endpoint)) return;");
  });
});

describe("the public buckets are no longer an index", () => {
  const sql = read("supabase/migrations/0151_stop_anon_listing_storage.sql");

  it("every PUBLIC-role read policy is dropped", () => {
    for (const p of [
      "avatars_public_read",
      "banners_public_read",
      "comment_images_public_read",
      "cosmetics: public read",
      "page-media: public read",
      "post-images: public read",
      "shot-media: public read",
      "show_media_public_read",
    ]) {
      expect(sql, p).toContain(`drop policy if exists "${p}" on storage.objects;`);
    }
  });

  it("the two gated policies are left alone", () => {
    // chat_media_select and voice_notes_select are granted to authenticated
    // and gated on can_read_chat_media — the shape the others should have
    // had. The migration names them in a comment saying so, which is why
    // this asserts on the DROP rather than on the name appearing at all.
    expect(sql).not.toContain('drop policy if exists "chat_media_select"');
    expect(sql).not.toContain('drop policy if exists "voice_notes_select"');
    expect(sql.match(/^drop policy/gm) ?? []).toHaveLength(8);
  });
});
