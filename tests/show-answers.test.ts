import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The answers to a question sticker, which until now nobody could read.
 *
 * The sticker promised a viewer "Sent — only they see it." The answer was
 * stored, the RLS policy on `show_answers` admitted the author, a notification
 * fired — and no screen in the app read any of it. `show_answers` appeared in
 * `src/` exactly once, in a comment. The promise was true and useless.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/(app)/shows/[showId]/answers/page.tsx");
const poll = read("src/components/shows/ShowPoll.tsx");
const viewer = read("src/components/shows/ShowViewer.tsx");
const notifications = read("src/app/(app)/notifications/page.tsx");

describe("the screen that reads them", () => {
  it("exists, and asks the table for them", () => {
    expect(page).toContain('.from("show_answers")');
    expect(page).toContain("asker_id(display_name, username, avatar_url, avatar_hue)");
  });

  it("is the author's and nobody else's", () => {
    expect(page).toContain("show.user_id !== user.id");
    // A Show that has gone and a Show that is not yours are the same answer:
    // saying "this is private" would confirm it exists.
    expect(page).toContain('<GoneScreen kind="show" />');
  });

  it("newest first, and bounded", () => {
    expect(page).toContain('.order("created_at", { ascending: false })');
    expect(page).toContain(".limit(200)");
  });

  it("groups them under the question each one answered", () => {
    expect(page).toContain('readLayers(show.layers).filter((l) => l.type === "question")');
    expect(page).toContain("byLayer");
  });

  it("and still shows answers to a question since taken off the Show", () => {
    // They are somebody's words. Dropping them because the sticker is gone
    // would lose the thing the screen exists for.
    // The filter itself, not just the name: `const orphans: Row[] = []`
    // satisfied a check for the name while dropping every one of them.
    expect(page).toContain(
      "const orphans = all.filter((r) => !questions.some((q) => q.id === r.layer_id));",
    );
    expect(page).toContain("To a question you removed");
  });
});

describe("getting there", () => {
  it("the notification lands on the answers, not on the bare Show", () => {
    // Its target_type is "show", so this has to be tested before the generic
    // show branch — which is also why it is written above it.
    const answerAt = notifications.indexOf('n.type === "show_answer"');
    const showAt = notifications.indexOf('n.target_type === "show" && n.target_id');
    expect(answerAt).toBeGreaterThan(-1);
    expect(answerAt).toBeLessThan(showAt);
    expect(notifications).toContain("`/shows/${n.target_id}/answers`");
  });

  it("and your own sticker is a way in rather than a box to fill", () => {
    expect(poll).toContain("Read the answers →");
    /*
     * A real link, so it is an ordinary navigation and not a scripted push.
     * Pinned with the leading space: `data-href={…}` contains `href={…}`, so
     * the obvious assertion passed with the anchor turned into a dead div.
     */
    expect(poll).toContain(" href={`/shows/${showId}/answers`}");
    expect(poll).toContain("<a");
  });
});

describe("what the person who answered sees next time", () => {
  it("the thread fetches their own answers, and only where there is a question", () => {
    expect(viewer).toContain("const hasQuestion = useMemo");
    expect(viewer).toContain('.eq("asker_id", currentUserId)');
    const effect = viewer.slice(viewer.indexOf("if (!hasQuestion"));
    expect(effect.slice(0, 80)).toContain("!currentUserId) return;");
  });

  it("their answer comes back with a way to change it", () => {
    expect(poll).toContain("const already = !sent && !rewriting ? mine : undefined;");
    expect(poll).toContain("Change it");
  });

  it("and sending clears the rewrite, so the answer shows and not the box", () => {
    const send = poll.slice(poll.indexOf("async function send()"));
    expect(send.slice(0, 700)).toContain("setRewriting(false);");
  });

  it("the words are still only the author's to read", () => {
    // The sticker's whole promise. It is the RLS policy that keeps it, and
    // the screen above is gated on being the author as well.
    expect(poll).toContain("Sent — only they see it.");
  });
});
