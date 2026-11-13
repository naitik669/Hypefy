import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Follow, on the card, beside the ⋯.
 *
 * Reusing the profile's own FollowButton rather than drawing another one:
 * it already knows the three states a follow can be in — none, requested
 * for a private account, following — and it already keeps every copy of
 * itself in step through a window event. That last part is what a feed
 * needs and a new button would not have: following somebody from one of
 * their posts has to update their other posts in the same scroll.
 *
 * The state comes from the page, not from the card. `followingIds` was
 * already fetched for the tail ranker's social bonus, so the button reads a
 * set that was in hand — one query for the page rather than one per card.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const card = read("src/components/feed/FeedCard.tsx");
const list = read("src/components/feed/FeedList.tsx");
const home = read("src/app/(app)/home/page.tsx");
const button = read("src/components/profile/FollowButton.tsx");

describe("the button on the card", () => {
  it("is the profile's button, not a second one", () => {
    expect(card).toContain('import { FollowButton } from "@/components/profile/FollowButton";');
    expect(card).toContain('variant="mini"');
  });

  it("sits to the left of the ⋯", () => {
    const follow = card.indexOf("<FollowButton");
    const dots = card.indexOf('aria-label="More"');
    expect(follow).toBeGreaterThan(-1);
    expect(follow).toBeLessThan(dots);
  });

  it("never appears on your own post", () => {
    // There is nothing to follow, and a disabled button there would only ask
    // to be pressed.
    expect(card).toContain("{uid && uid !== post.user_id && (");
  });

  it("and says Following once you do", () => {
    // The three states live in FollowButton; this is the one that was asked
    // for by name.
    expect(button).toContain('state === "following"');
    expect(button).toContain('? "Following"');
    expect(button).toContain('? "Requested"');
  });
});

describe("where the state comes from", () => {
  it("the page resolves it once, not the card per row", () => {
    expect(list).toContain("initialFollowing={followingSet.has(item.post.user_id)}");
    expect(list).toContain("initialRequested={requestedSet.has(item.post.user_id)}");
  });

  it("reusing the set the ranker already had", () => {
    // followingIds was already fetched and already passed in. Adding a second
    // query for the same answer is the thing this avoids.
    expect(home).toContain("followingIds={[...followingIds]}");
    expect(list.match(/const followingSet = new Set\(followingIds\);/g) ?? []).toHaveLength(1);
  });

  it("and pending requests are fetched too, so a private account is not re-asked", () => {
    expect(home).toContain('.from("follow_requests")');
    expect(home).toContain('.eq("requester_id", user.id)');
    expect(home).toContain("requestedIds={requestedIds}");
  });

  it("a standalone card still answers for itself", () => {
    // The post page and the profile viewer pass nothing, exactly as they pass
    // no hyper status, so the card has to ask.
    expect(card).toContain("if (initialFollowing !== undefined) return;");
    expect(card).toContain('supabase.from("follows").select("id").eq("follower_id", uid)');
  });

  it("and does not ask on its own post either", () => {
    // Two queries per card for a button that is never drawn.
    const fetchBlock = card.slice(card.indexOf("if (initialFollowing !== undefined) return;"));
    expect(fetchBlock.slice(0, 200)).toContain("if (!uid || uid === post.user_id) return;");
  });
});
