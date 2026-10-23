import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The bugs a user feels, and the shapes that caused them.
 *
 * Four of these are the same mistake wearing different clothes: a failed
 * request read as an answer. A Supabase query that errors returns `data: null`
 * alongside the error, so code that only looks at `data` sees an empty page
 * and concludes "that's everything" — and because that conclusion is latched
 * into state, one dropped request ends the feed, the reel, or the thread for
 * the rest of the session. The other two are stale closures: a handler built
 * once that keeps reading the values from the render that built it.
 *
 * These assert on source text because the fixes are not pure functions —
 * they are what a component reads, and when. Each assertion is written
 * against the exact shape that was wrong, so it fails if the shape returns.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const reels = read("src/components/shots/ReelsFeed.tsx");
const feed = read("src/components/feed/FeedList.tsx");
const chat = read("src/components/messages/RealChatView.tsx");
const nav = read("src/components/layout/BottomNav.tsx");
const notifs = read("src/app/(app)/notifications/page.tsx");
const overlay = read("src/components/messages/ForwardedComment.tsx");

describe("a failed page is not the end of the reel", () => {
  it("reads the error before deciding there is nothing more", () => {
    // The old body was `.then(({ data }) => …)`: on failure `fresh.length`
    // was 0, `0 < 10` set noMore, the end card appeared, and no later swipe
    // ever fetched again.
    expect(reels).toContain("({ data, error })");
    const handler = reels.slice(reels.indexOf("({ data, error })"));
    expect(handler.indexOf("if (error) {")).toBeLessThan(handler.indexOf("setNoMore(true)"));
  });

  it("decides on the rows that came back, not the ones that survived dedupe", () => {
    expect(reels).toContain("if ((data?.length ?? 0) < 10) setNoMore(true);");
    expect(reels).not.toContain("if (fresh.length < 10) setNoMore(true);");
  });

  it("releases the in-flight flag on a rejection too, not only on a result", () => {
    // Left raised, it blocks every subsequent page as hard as noMore does.
    const body = reels.slice(reels.indexOf("fetchingMore.current = true;"));
    expect(body.split("fetchingMore.current = false;").length - 1).toBeGreaterThanOrEqual(4);
  });

  it("takes the cursor from the oldest reel, not the last array slot", () => {
    expect(reels).toContain("const oldest = reels.reduce<string | null>(");
    expect(reels).not.toContain("const oldest = reels[reels.length - 1]?.created_at;");
  });
});

describe("a failed first page says so instead of showing nothing", () => {
  it("the ids-tab state can tell nothing-to-show from nothing-loaded", () => {
    expect(feed).toContain("failed: boolean;");
    expect(feed).toContain(
      "const EMPTY_IDS_STATE: IdsListState = { posts: [], done: false, init: false, failed: false };",
    );
  });

  it("a first-page error is recorded rather than swallowed", () => {
    const fn = feed.slice(feed.indexOf("async function loadMoreIdsTab"));
    const body = fn.slice(0, fn.indexOf("async function loadMore("));
    expect(body).toContain("if (current.length === 0) {");
    expect(body).toContain("failed: true");
    // Still must not latch done — that was the original fix and it stands.
    expect(body).not.toContain("done: true, init: true, failed: true");
  });

  it("the failed tab renders a retry and no spinner", () => {
    expect(feed).toContain("const idsFailed =");
    expect(feed).toContain("function retryTab()");
    expect(feed).toContain("Try again");
    // The sentinel must not render underneath the retry, or the observer
    // fires and the two fight.
    expect(feed).toContain("{!activeDone && !idsEmpty && !idsFailed && !noHypersPicked && (");
  });

  it("the auto-load effect does not immediately re-run into the same failure", () => {
    expect(feed).toContain("!st[tab].init && !st[tab].failed");
  });
});

describe("paging back to a found message", () => {
  it("loadOlder reads the current first message, not the one it closed over", () => {
    // goToMessage awaits loadOlder in a loop. Reading `messages[0]` meant
    // every iteration after the first asked for the same page, the dedupe
    // dropped all of it, and the jump reached nothing older than the page
    // already on screen.
    expect(chat).toContain("const oldest = messagesRef.current[0];");
    expect(chat).not.toContain("const oldest = messages[0];");
  });

  it("and the current hasMore, in both the loop and the guard", () => {
    expect(chat).toContain("const hasMoreRef = useRef(hasMore);");
    expect(chat).toContain("hasMoreRef.current = hasMore;");
    expect(chat).toContain("if (loadingOlderRef.current || !hasMoreRef.current) return;");
    expect(chat).toContain("if (!hasMoreRef.current) break;");
  });

  it("the prepend updates the ref in the same turn as the state", () => {
    // Otherwise the next iteration of the loop can run before React has
    // re-rendered, and the ref still holds the previous first message.
    const prepend = chat.slice(chat.indexOf("justPrepended.current = true;"));
    expect(prepend.slice(0, 700)).toContain("messagesRef.current = next;");
  });

  it("hasMore is settled on the rows returned, and written to the ref", () => {
    expect(chat).toContain("if ((data?.length ?? 0) < MSG_PAGE) {");
    expect(chat).toContain("hasMoreRef.current = false;");
    expect(chat).not.toContain("if (older.length < MSG_PAGE) setHasMore(false);");
  });
});

describe("a forwarded comment that has not loaded is not a deleted one", () => {
  it("the overlay has three states, not two", () => {
    expect(overlay).toContain("comment: ForwardedComment | null | undefined;");
    // The claim is made only when the answer is known.
    expect(overlay).toContain(") : comment === null ? (");
    expect(overlay).toContain("This comment was deleted");
  });

  it("the chat does not collapse unknown into deleted", () => {
    expect(chat).toContain("const comment = fwdComments[commentId];");
    expect(chat).not.toContain("const comment = fwdComments[commentId] ?? null;");
  });

  it("a failed lookup leaves the ids askable again", () => {
    const fn = chat.slice(chat.indexOf("const fwdAsked ="));
    expect(fn.slice(0, 2500)).toContain("want.forEach((id) => fwdAsked.current.delete(id));");
  });
});

describe("the messages badge", () => {
  it("asks for the count instead of doing arithmetic on it", () => {
    // The badge counts conversations with something unread, skipping muted
    // ones and ones you spoke in last (unread_dm_count, 0046). +1 per message
    // and -1 per read could not agree with that, and the error accumulated
    // for as long as the tab stayed open.
    expect(nav).toContain('supabase.rpc("unread_dm_count")');
    expect(nav).not.toContain("setUnreadMsgs((n) => n + 1)");
    expect(nav).not.toContain("setUnreadMsgs((n) => Math.max(0, n - 1))");
  });

  it("reads whether the inbox is open now, not at subscribe time", () => {
    // The effect intentionally depends only on the user id, so the value
    // captured in the handler never changed after the first render.
    expect(nav).toContain("const messagesActiveRef = useRef(messagesActive);");
    expect(nav).toContain("messagesActiveRef.current = messagesActive;");
    const handler = nav.slice(nav.indexOf('table: "messages" }'));
    expect(handler.slice(0, 400)).toContain("!messagesActiveRef.current");
  });

  it("coalesces a burst and cleans up its timer", () => {
    expect(nav).toContain("const UNREAD_REFRESH_MS = 400;");
    expect(nav).toContain("if (timer) clearTimeout(timer);");
    expect(nav).toContain("alive = false;");
  });
});

describe("the notifications channel", () => {
  it("is not subscribed after the page has already gone", () => {
    // getUser() resolves after unmount: cleanup ran with `channel` still
    // null, then the subscribe happened with nothing left to tear it down.
    const effect = notifs.slice(
      notifs.indexOf("let channel: ReturnType<typeof supabase.channel> | null = null;"),
    );
    expect(effect.slice(0, 900)).toContain("if (!user || cancelled) return;");
    expect(effect.slice(0, 2600)).toContain("cancelled = true;");
  });
});

describe("blob URLs for pictures that were never sent", () => {
  it("the chat picker releases its own, and only its own", () => {
    const picker = read("src/components/messages/MediaPicker.tsx");
    expect(picker).toContain("if (e.file) URL.revokeObjectURL(e.preview);");
  });

  it("the showcase editor releases its upload thumbnails", () => {
    const editor = read("src/components/showcase/ShowcaseEditor.tsx");
    expect(editor).toContain('if (pick.kind === "upload") URL.revokeObjectURL(pick.thumb);');
  });
});
