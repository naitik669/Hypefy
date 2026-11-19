import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  threadOf,
  mediaBody,
  commentProblem,
  MAX_COMMENT,
} from "../packages/core/src/comments";
import {
  normaliseComment,
  COMMENT_COLUMNS,
  PAGE,
} from "../apps/mobile/src/comments/load";

/**
 * The phone's comments.
 *
 * Two firsts, and the tests follow them: the first write that creates a
 * ROW rather than toggling one, and the first screen that is not a tab —
 * so the first reach assertion about navigating in and back out.
 */

const WEB = "src/components/feed/CommentsSheet.tsx";
const LOAD = "apps/mobile/src/comments/load.ts";
const SCREEN = "apps/mobile/app/post/[id]/comments.tsx";
const CARD = "apps/mobile/src/feed/FeedCard.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Comments and imports gone — both have stood in for code in this repo. */
function body(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

/** Comments gone, imports kept. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

type Node = { id: string; parent_id: string | null; pinned_at: string | null };
const node = (id: string, parent: string | null = null, pinned = false): Node => ({
  id,
  parent_id: parent,
  pinned_at: pinned ? "2026-01-01T00:00:00Z" : null,
});

describe("threading is one rule for both clients", () => {
  it("the web imports it rather than keeping its own", () => {
    /*
     * This is not a formatting detail. Threading decides whether a reply
     * is ever SEEN, and two clients disagreeing about it would show
     * different conversations for the same post.
     */
    const web = code(WEB);
    expect(web).toMatch(/from "@\/lib\/comments"/);
    expect(web, "the web is threading for itself again").not.toMatch(
      /function rootOf\(/,
    );
  });

  it("a reply to a reply is still shown, under its root", () => {
    /*
     * The web's old code nested those a second level down and then
     * rendered only one level — so a reply to a reply was written, stored,
     * and never seen again by anyone. The walk goes all the way up.
     */
    const out = threadOf([node("a"), node("b", "a"), node("c", "b")]);
    expect(out.map((t) => t.root.id)).toEqual(["a"]);
    expect(out[0].replies.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("a reply whose parent is missing becomes its own root, not nothing", () => {
    // Deleted, or simply not in this page. Dropping it loses a comment.
    const out = threadOf([node("orphan", "gone")]);
    expect(out.map((t) => t.root.id)).toEqual(["orphan"]);
  });

  it("a cycle in the data stops rather than hanging the screen", () => {
    // Nothing in the schema forbids it, and an infinite walk during render
    // is a frozen app rather than a wrong list.
    const out = threadOf([node("a", "b"), node("b", "a")]);
    expect(out.length).toBeGreaterThan(0);
  });

  it("the pinned comment reads first, and the rest keep their order", () => {
    const out = threadOf([node("first"), node("second"), node("pinned", null, true)]);
    expect(out.map((t) => t.root.id)).toEqual(["pinned", "first", "second"]);
  });

  it("and replies keep the order they were posted in", () => {
    const out = threadOf([node("root"), node("r1", "root"), node("r2", "root")]);
    expect(out[0].replies.map((r) => r.id)).toEqual(["r1", "r2"]);
  });
});

describe("what counts as a picture in a comment body", () => {
  it("a GIF host or an image extension, and nothing else", () => {
    /*
     * It used to be read as "starts with https://", so a comment that was
     * nothing but a link to a page rendered as a broken image — and a
     * plain link could not be posted at all.
     */
    expect(mediaBody("https://media.tenor.com/abc.gif")).toBe(
      "https://media.tenor.com/abc.gif",
    );
    expect(mediaBody("https://example.test/a.png")).toBe("https://example.test/a.png");
    expect(mediaBody("https://example.test/a.jpeg?v=2")).toBe(
      "https://example.test/a.jpeg?v=2",
    );
    expect(mediaBody("https://example.test/article")).toBeNull();
    expect(mediaBody("look https://example.test/a.png")).toBeNull();
    expect(mediaBody("http://example.test/a.png")).toBeNull();
    expect(mediaBody("")).toBeNull();
  });

  it("and a link with words after it is not a picture", () => {
    /*
     * The case the whitespace guard exists for, and the one my first set
     * of fixtures missed — mutation C9 deleted the guard and stayed green.
     * A GIF host is matched by its PREFIX, so without the guard
     * "https://media.tenor.com/abc.gif look at this" is returned whole and
     * then used as an image source, which renders nothing and loses the
     * words the person wrote.
     */
    expect(mediaBody("https://media.tenor.com/abc.gif look at this")).toBeNull();
    expect(mediaBody("https://example.test/a.png with a caption")).toBeNull();
    // The extension form with a trailing newline, which trim() handles.
    expect(mediaBody("https://example.test/a.png\n")).toBe("https://example.test/a.png");
  });
});

describe("the length cap is the database's own", () => {
  it("MAX_COMMENT is the number the check constraint enforces", () => {
    /*
     * The first version of this guessed 500, which would have had the
     * phone refuse comments Postgres accepts and the website posts. The
     * figure comes from migration 0149's `comments_body_len`.
     */
    const migration = read("supabase/migrations/0149_scale_indexes_and_limits.sql");
    const m = migration.match(/comments_body_len check \(body is null or char_length\(body\) <= (\d+)\)/);
    expect(m, "the comments length constraint has moved or changed shape").toBeTruthy();
    expect(MAX_COMMENT).toBe(Number(m?.[1]));
  });

  it("an empty comment and an over-long one are both refused, in words", () => {
    expect(commentProblem("")).toMatch(/Write something/);
    expect(commentProblem("   ")).toMatch(/Write something/);
    expect(commentProblem("hello")).toBeNull();
    expect(commentProblem("x".repeat(MAX_COMMENT))).toBeNull();
    expect(commentProblem("x".repeat(MAX_COMMENT + 1))).toMatch(
      new RegExp(String(MAX_COMMENT)),
    );
  });

  it("and whitespace does not count toward the cap", () => {
    // Trimmed before measuring, as the body is trimmed before posting.
    expect(commentProblem(` ${"x".repeat(MAX_COMMENT)} `)).toBeNull();
  });
});

describe("the queries are the website's queries", () => {
  it("the same page size, so 'there are more' means the same thing", () => {
    const web = code(WEB);
    const m = web.match(/const PAGE = (\d+)/);
    expect(m, "the web no longer declares a page size").toBeTruthy();
    expect(PAGE).toBe(Number(m?.[1]));
  });

  it("deleted comments are left out, because deleting is a soft delete", () => {
    /*
     * The row stays so replies keep their parent. Without the filter a
     * deleted comment reappears on the phone while the website has
     * stopped showing it.
     */
    /*
     * Counted, not merely present. The web filters in two places — the
     * page fetch and the realtime top-up — so a check for "it appears"
     * stayed green when one of them lost it. Mutation C41 found that.
     */
    const web = code(WEB);
    expect(
      [...web.matchAll(/\.is\("deleted_at", null\)/g)].length,
      "the web filters deleted comments in fewer places than it did",
    ).toBe(2);
    expect(body(LOAD)).toMatch(/\.is\("deleted_at", null\)/);
  });

  it("oldest first, which is the order a conversation is read in", () => {
    expect(code(WEB)).toMatch(/\.order\("created_at", \{ ascending: true \}\)/);
    expect(body(LOAD)).toMatch(/\.order\("created_at", \{ ascending: true \}\)/);
  });

  it("asks for the columns the rows render, and no more", () => {
    for (const column of [
      "id",
      "user_id",
      "body",
      "image_url",
      "created_at",
      "updated_at",
      "pinned_at",
      "parent_id",
      "hype_count",
    ]) {
      expect(COMMENT_COLUMNS, `${column} is not asked for`).toMatch(
        new RegExp(`(^|[ ,])${column}[,\\s]`),
      );
    }
    expect(COMMENT_COLUMNS).toContain("profiles(");
  });

  it("and an embedded profile is read whether it arrives as a row or a list", () => {
    const asObject = normaliseComment({ id: "c", profiles: { display_name: "Maya" } });
    const asArray = normaliseComment({ id: "c", profiles: [{ display_name: "Maya" }] });
    expect(asObject.profiles?.display_name).toBe("Maya");
    expect(asArray.profiles?.display_name).toBe("Maya");
    expect(normaliseComment({ id: "c", profiles: [] }).profiles).toBeNull();
    expect(normaliseComment({ id: "c" }).profiles).toBeNull();
  });
});

describe("posting a comment goes through the website's own RPC", () => {
  it("create_comment, not an insert", () => {
    /*
     * The function enforces the rate limit and writes the notification.
     * An insert would skip both — and skipping the rate limit is the one
     * that matters, because it is the only thing standing between a
     * comment box and a spam wave.
     */
    const src = body(LOAD);
    expect(src).toMatch(/rpc\("create_comment"/);
    expect(src, "the phone inserts comments directly").not.toMatch(
      /from\("comments"\)[\s\S]{0,80}\.insert/,
    );
    expect(code(WEB)).toMatch(/rpc\("create_comment"/);
  });

  it("with the post's AUTHOR as the owner, because that is who gets told", () => {
    /*
     * Passing the commenter instead sends the notification to the wrong
     * person — silent and wrong rather than broken, which is why it is
     * asserted rather than left to review.
     */
    const src = body(LOAD);
    expect(src).toMatch(/p_owner_id: args\.ownerId/);
    expect(src).toMatch(/p_post_id: args\.postId/);
    expect(src).toMatch(/p_body: args\.body/);
    // The card hands the author through, and the screen refuses without it.
    expect(body(CARD)).toMatch(/owner: post\.user_id/);
    expect(body(SCREEN)).toMatch(/if \(!owner\)/);
    expect(body(SCREEN)).toMatch(/Could not tell who to notify/);
  });

  it("Postgres's own message is shown, not one catch-all sentence", () => {
    /*
     * The web's note: a rate limit reads very differently from a dead
     * session, and one sentence made every failure look the same and none
     * of them diagnosable.
     */
    const src = body(LOAD);
    expect(src).toMatch(/"message" in error/);
    expect(body(SCREEN)).toMatch(/setSendError\(result\.error\)/);
  });

  it("and the box is cleared only on success", () => {
    /*
     * The web's own note again: clearing unconditionally threw away what
     * you had written on every failure. The clear sits after the error
     * branch has returned.
     */
    const src = body(SCREEN);
    const send = src.slice(src.indexOf("const send ="), src.indexOf("const rows ="));
    const errorAt = send.indexOf("setSendError(result.error)");
    const clearAt = send.indexOf('setBody("")');
    expect(errorAt, "the failure branch is gone").toBeGreaterThan(-1);
    expect(clearAt, "the box is never cleared").toBeGreaterThan(-1);
    expect(clearAt, "the box is cleared before the failure is handled").toBeGreaterThan(errorAt);
    expect(send, "the failure branch does not return").toMatch(
      /setSendError\(result\.error\);\s*return;/,
    );
  });

  it("the refusal comes before the round trip, in words", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/commentProblem\(body\)/);
    expect(src).toMatch(/setSendError\(problem\)/);
    expect(src, "the gate is bypassed").toMatch(/if \(problem\) \{[\s\S]{0,80}return;/);
  });
});

describe("the screen can be reached, and left", () => {
  /*
   * The rule from #78, and the first time it applies to a screen that is
   * not a tab: a screen can match the website perfectly and be
   * unreachable, and nothing in a parity suite notices.
   */
  it("the route exists where the card navigates", () => {
    expect(existsSync(SCREEN), "the comments route is missing").toBe(true);
    expect(body(CARD)).toMatch(/pathname: "\/post\/\[id\]\/comments"/);
    expect(body(CARD)).toMatch(/params: \{ id: post\.id, owner: post\.user_id \}/);
  });

  it("the comment button is what reaches it", () => {
    const src = body(CARD);
    const actions = src.slice(src.indexOf("styles.actions"), src.indexOf("Caption"));
    expect(actions).toMatch(/router\.push\(/);
    // Two actions are live now — hype and comments — and no more.
    expect(
      [...actions.matchAll(/onPress/g)].length,
      "an action gained a handler without being announced",
    ).toBe(2);
    expect(actions).toMatch(/onPress=\{hype\.toggle\}/);
  });

  it("and pushes rather than replaces, so Back returns to the feed", () => {
    /*
     * `replace` would leave nowhere to go back to, which on Android means
     * the hardware button leaves the app from a comment thread.
     */
    expect(body(CARD)).toMatch(/router\.push\(/);
    expect(body(CARD), "the card replaces the feed instead of stacking").not.toMatch(
      /router\.replace\(\{/,
    );
  });

  it("there is a back control as well as the system gesture", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/accessibilityLabel="Back"/);
    expect(src).toMatch(/router\.back\(\)/);
  });

  it("and it is a route rather than a sheet, for a stated reason", () => {
    /*
     * The web's BottomSheet and its gesture are not ported, and a route
     * gets Android's own back — the system gesture and the hardware
     * button — for free. A sheet that only closes by tapping a small X is
     * the kind of thing that feels wrong without anyone saying why.
     */
    expect(code(WEB)).toMatch(/BottomSheet/);
    expect(read(SCREEN)).toMatch(/hardware button/);
    expect(body(SCREEN), "a sheet crept in without the gesture").not.toMatch(/BottomSheet/);
  });
});

describe("the three states, and what is not ported", () => {
  it("loading, failed with the reason, and empty", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/ActivityIndicator/);
    expect(src).toMatch(/Could not load the comments/);
    expect(src).toMatch(/\{error\}/);
    expect(src).toMatch(/ListEmptyComponent/);
    expect(src).toMatch(/No comments yet/);
  });

  it("a longer thread says it is truncated rather than looking complete", () => {
    /*
     * The web pages on scroll. Until this does, a thread of 40 would show
     * 30 and look finished — which is the failure mode that makes someone
     * think their comment was lost.
     */
    const src = body(SCREEN);
    expect(src).toMatch(/ListFooterComponent/);
    expect(src).toMatch(/Showing the first {PAGE}/);
    expect(src, "the page size is written out a second time").not.toMatch(/PAGE_LABEL/);
    expect(body(LOAD)).toMatch(/more: rows\.length === PAGE/);
  });

  it("a comment's hype is a count, not a button", () => {
    // Hyping a comment is a write of its own and is not ported; a star
    // that looks tappable and is not is worse than a plain number.
    const src = body(SCREEN);
    const row = src.slice(src.indexOf("function Row("));
    expect(row, "the comment star became pressable without being announced").not.toMatch(
      /onPress/,
    );
  });

  it("and what is missing is written down where someone will read it", () => {
    const src = read(LOAD);
    for (const absent of ["Paging", "Replying", "Mentions and hashtags"]) {
      expect(src, `${absent} is no longer recorded as absent`).toContain(absent);
    }
  });

  it("the thread is one level deep, as the web renders it", () => {
    const src = body(SCREEN);
    expect(src).toMatch(/item\.replies\.map/);
    expect(src).toMatch(/rowReply/);
    // And a reply written on the web still appears, because the threading
    // is shared rather than reimplemented.
    expect(body(LOAD)).toMatch(/threadOf\(comments\)/);
  });
});
