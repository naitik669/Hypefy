import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_PINNED_MESSAGES,
  PINNABLE_KINDS,
  PIN_SWIPE_PX,
  TILT_MAX,
  canPin,
  fileSize,
  opensPinBoard,
  pinLabel,
  pinTilt,
  pinWhen,
  toPins,
  type PinRow,
} from "@/lib/chat-pins";

/**
 * A chat's pin board: keeping something where both people can find it, and
 * the board that shows it back on the side it was said from.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0142_message_pins.sql");
const board = read("src/components/messages/PinBoard.tsx");
const chat = read("src/components/messages/RealChatView.tsx");

const ME = "me-1";
const THEM = "them-1";

function row(over: Partial<PinRow> = {}): PinRow {
  return {
    id: "m1",
    kind: "text",
    body: "hello",
    sender_id: THEM,
    created_at: "2026-10-01T10:00:00Z",
    pinned_at: "2026-10-02T10:00:00Z",
    pinned_by: ME,
    ...over,
  };
}

describe("which side a pin hangs on", () => {
  it("mine on the right, theirs on the left", () => {
    const pins = toPins([row({ id: "a", sender_id: ME }), row({ id: "b", sender_id: THEM })], ME);
    expect(pins.find((p) => p.id === "a")!.side).toBe("right");
    expect(pins.find((p) => p.id === "b")!.side).toBe("left");
  });

  it("in a group everyone else is still on the left", () => {
    // The board borrows the thread's grammar, and the thread puts every other
    // member on the left however many there are.
    const pins = toPins([row({ id: "a", sender_id: "someone-else" })], ME);
    expect(pins[0].side).toBe("left");
    expect(pins[0].mine).toBe(false);
  });

  it("the side follows who sent it, not who pinned it", () => {
    // Either side may pin either side's messages; the card still belongs to
    // whoever said it.
    const pins = toPins([row({ sender_id: THEM, pinned_by: ME })], ME);
    expect(pins[0].side).toBe("left");
  });
});

describe("the order of the board", () => {
  it("newest pin first, whenever the message was sent", () => {
    const pins = toPins(
      [
        row({ id: "old-message-pinned-today", created_at: "2026-01-01T00:00:00Z", pinned_at: "2026-10-05T00:00:00Z" }),
        row({ id: "new-message-pinned-last-week", created_at: "2026-10-04T00:00:00Z", pinned_at: "2026-09-28T00:00:00Z" }),
      ],
      ME,
    );
    expect(pins.map((p) => p.id)).toEqual(["old-message-pinned-today", "new-message-pinned-last-week"]);
  });

  it("a row that is not pinned is not on the board", () => {
    expect(toPins([row({ pinned_at: null })], ME)).toEqual([]);
  });

  it("the board asks for no more than the cap allows", () => {
    expect(read("src/app/(app)/messages/[threadId]/pins/page.tsx")).toContain(".limit(MAX_PINNED_MESSAGES)");
  });
});

describe("what each card draws", () => {
  const cardOf = (over: Partial<PinRow>) => toPins([row(over)], ME)[0]?.card;

  it("a photo, a video and a GIF are one card told which it is", () => {
    expect(cardOf({ kind: "image", body: "u.jpg" })).toEqual({ shape: "photo", url: "u.jpg", motion: false, more: 0 });
    expect(cardOf({ kind: "video", body: "u.mp4" })).toMatchObject({ shape: "photo", motion: true });
    expect(cardOf({ kind: "gif", body: "u.gif" })).toMatchObject({ shape: "photo", motion: false });
  });

  it("a folder of photos shows the first and counts the rest", () => {
    const body = JSON.stringify({ caption: "", items: [{ url: "a.jpg", type: "image" }, { url: "b.jpg", type: "image" }, { url: "c.jpg", type: "image" }] });
    expect(cardOf({ kind: "album", body })).toMatchObject({ shape: "photo", url: "a.jpg", more: 2 });
    expect(pinLabel(cardOf({ kind: "album", body })!, "album")).toBe("3 PHOTOS");
  });

  it("a voice note keeps its own shape and length", () => {
    const body = JSON.stringify({ url: "v.webm", duration: 24, peaks: [10, 90, 40] });
    expect(cardOf({ kind: "voice", body })).toEqual({ shape: "voice", url: "v.webm", duration: 24, peaks: [10, 90, 40] });
  });

  it("a voice note sent before notes carried a shape still draws", () => {
    // Old rows hold the bare URL in the body rather than JSON.
    expect(cardOf({ kind: "voice", body: "v.webm" })).toEqual({ shape: "voice", url: "v.webm", duration: null, peaks: null });
  });

  it("a shared post or Shot, and the fact that it is gone", () => {
    const shot = cardOf({ kind: "shot", body: null, shot: { id: "s1", media_url: "s.mp4", poster_url: null, profiles: { username: "naitik" } } });
    expect(shot).toMatchObject({ shape: "share", of: "shot", targetId: "s1", video: "s.mp4", username: "naitik" });
    // Nothing came back with the join: the post was deleted or can no longer
    // be seen, and the card has to say so rather than show a blank tile.
    expect(cardOf({ kind: "post", body: null, post: null })).toMatchObject({ shape: "share", targetId: null, thumb: null });
    expect(board).toContain("No longer available");
  });

  it("a document and a song", () => {
    expect(cardOf({ kind: "document", body: JSON.stringify({ url: "d.pdf", name: "Deck.pdf", size: 2_200_000 }) })).toMatchObject({
      shape: "file",
      name: "Deck.pdf",
    });
    expect(cardOf({ kind: "music", body: JSON.stringify({ id: "t1", title: "Confident", artist: "Justin Bieber" }) })).toMatchObject({
      shape: "track",
    });
  });

  it("a message with nothing left in it is left off", () => {
    expect(toPins([row({ kind: "text", body: "   " })], ME)).toEqual([]);
    expect(toPins([row({ kind: "image", body: null })], ME)).toEqual([]);
    expect(toPins([row({ kind: "album", body: "not json" })], ME)).toEqual([]);
  });

  it("the caption says what the thing is", () => {
    expect(pinLabel({ shape: "voice", url: "v", duration: 24, peaks: null }, "voice")).toBe("VOICE · 0:24");
    expect(pinLabel({ shape: "voice", url: "v", duration: 95, peaks: null }, "voice")).toBe("VOICE · 1:35");
    expect(pinLabel({ shape: "voice", url: "v", duration: null, peaks: null }, "voice")).toBe("VOICE NOTE");
    expect(pinLabel({ shape: "note", text: "x" }, "text")).toBe("MESSAGE");
    expect(pinLabel({ shape: "note", text: "x" }, "page_reply")).toBe("PAGE REPLY");
    expect(pinLabel({ shape: "photo", url: "u", motion: true, more: 0 }, "video")).toBe("VIDEO");
  });
});

describe("how far a card leans", () => {
  it("the same card leans the same way every time", () => {
    // Random tilt was tried first and jittered on every re-render, which read
    // as a glitch. It also has to agree with the other person's phone.
    expect(pinTilt("abc-123")).toBe(pinTilt("abc-123"));
  });

  it("never more than a couple of degrees, either way", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `msg-${i}-uuid`);
    const tilts = ids.map(pinTilt);
    expect(Math.max(...tilts)).toBeLessThanOrEqual(TILT_MAX);
    expect(Math.min(...tilts)).toBeGreaterThanOrEqual(-TILT_MAX);
    // Both ways, so the board does not list to one side.
    expect(tilts.some((t) => t > 0.5)).toBe(true);
    expect(tilts.some((t) => t < -0.5)).toBe(true);
  });

  it("different messages lean differently", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `m-${i}`);
    expect(new Set(ids.map(pinTilt)).size).toBeGreaterThan(20);
  });
});

describe("what may be pinned", () => {
  it("not a join notice, and not a one-shot", () => {
    // A one-shot exists to be seen once and go; a pin is a promise to keep
    // something. The two cannot both be honoured.
    expect(canPin("oneshot", false)).toBe(false);
    expect(canPin("system", false)).toBe(false);
    expect(PINNABLE_KINDS).not.toContain("oneshot");
    expect(PINNABLE_KINDS).not.toContain("system");
    // And the database refuses them too, so the list above is the
    // explanation rather than the enforcement.
    expect(sql).toContain("v_kind in ('system', 'oneshot')");
    expect(sql).toContain("raise exception 'That cannot be pinned'");
  });

  it("not something that has been unsent", () => {
    expect(canPin("text", true)).toBe(false);
    expect(sql).toContain("where id = p_id and not is_unsent and removed_at is null");
  });

  it("everything else people actually send", () => {
    for (const k of ["text", "image", "video", "gif", "album", "voice", "music", "document", "post", "shot"]) {
      expect(canPin(k, false)).toBe(true);
    }
  });

  it("not one still on its way to the server", () => {
    // An optimistic row has no id the server knows, so pinning it would fail.
    expect(chat).toContain('!menu.msg.id.startsWith("temp-")');
  });
});

describe("holding an attachment offers to pin it", () => {
  const peek = read("src/components/feed/PostPeek.tsx");

  it("every pinnable kind can actually be held", () => {
    // The menu is reached by a hold, so a bubble with no hold handler cannot
    // be pinned however pinnable its kind is. A shared song was exactly that
    // — the one message in the thread with no hold at all, so it could not
    // be replied to, forwarded or unsent either.
    const bubbles = chat.slice(chat.indexOf('m.kind === "post" && m.post'), chat.indexOf("{/* Reaction chips */}"));
    // Split on the branch delimiter itself, so a `m.kind` mentioned inside a
    // branch's own code cannot be mistaken for the start of the next one.
    const branches = new Map<string, string>();
    for (const chunk of bubbles.split(') : m.kind === "')) {
      const kind = chunk.slice(0, chunk.indexOf('"'));
      if (kind && !kind.includes("\n")) branches.set(kind, chunk);
    }
    for (const kind of ["music", "document", "album", "video", "voice", "page_reply"]) {
      expect(branches.has(kind), `${kind} bubble`).toBe(true);
      expect(branches.get(kind), `${kind} hold`).toContain("onPressStart(m, e");
    }
  });

  it("a shared post or Shot gets Pin where the hold actually lands", () => {
    // Holding those two opens the peek, not the message's menu, so Pin has
    // to be on the peek — otherwise pinning an attachment is the one pin
    // that takes two taps.
    expect(peek).toContain('<PeekAction label={pinned ? "Unpin" : "Pin"}');
    expect(chat).toContain("pinned={!!peek.msg.pinned_at}");
    expect(chat).toContain("void togglePin(peek.msg); setPeek(null);");
  });

  it("the peek keeps its Pin optional, so the feed never shows one", () => {
    // The same peek opens from a grid tile, where there is no chat to pin to.
    expect(peek).toContain("onPin?: () => void;");
    expect(peek).toContain("{onPin && (");
  });

  it("a hold on a song does not start it playing", () => {
    // The chip is a player and handles its own tap first, so the guard has
    // to run in the capture phase or the hold plays the song.
    expect(chat).toContain("onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation();");
  });
});

describe("who may pin, and how many", () => {
  it("any member, including the other person's messages", () => {
    // The board belongs to the conversation, not to whoever spoke.
    expect(sql).toContain("if not public.is_conv_member(v_conv) then raise exception 'Not your chat'; end if;");
    expect(sql).not.toContain("sender_id = v_me");
  });

  it("the app and the database agree on the cap", () => {
    expect(MAX_PINNED_MESSAGES).toBe(30);
    expect(sql).toContain("returns integer language sql immutable as $$ select 30 $$");
  });

  it("the cap counts that chat's pins, not everyone's", () => {
    expect(sql).toContain("where conversation_id = v_conv and pinned_at is not null and id <> p_id");
    expect(sql).toContain("This chat can pin % messages. Unpin one first.");
  });

  it("not the client's column to write", () => {
    // A column revoke alone would do nothing here: Supabase's default
    // privileges give `authenticated` UPDATE on the whole table, and a
    // table-wide grant already covers every column. The trigger is what
    // actually keeps the sender from setting pinned_at past the cap, or
    // pinned_by to someone who did not pin it.
    expect(sql).toContain("create trigger guard_message_pins");
    expect(sql).toContain("raise exception 'Use set_message_pinned to pin a message'");
    expect(sql).toContain("perform set_config('hypefy.pinning', 'on', true);");
    // Transaction-local, so the door does not stay open for the next
    // statement on the same connection.
    expect(sql).toContain("current_setting('hypefy.pinning', true)");
    expect(sql).toContain("revoke update (pinned_at, pinned_by) on public.messages from authenticated, anon;");
    expect(sql).toContain("revoke all on function public.set_message_pinned(uuid, boolean) from public, anon;");
    expect(sql).toContain("grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;");
  });

  it("unpinning clears who pinned it, so it cannot be stale", () => {
    expect(sql).toContain("pinned_by = case when p_pinned then v_me else null end");
  });

  it("the cap is said in words a person can act on", () => {
    // The server's sentence is already addressed to the reader, so it is
    // passed through rather than replaced with a generic failure.
    expect(chat).toContain('showToast(error.message.includes("can pin") ? error.message : "Couldn\'t pin that");');
  });
});

describe("the board reads only what is still there", () => {
  it("an unsent or removed message drops off on its own", () => {
    // No cleanup trigger: the query is what keeps the board honest.
    const page = read("src/app/(app)/messages/[threadId]/pins/page.tsx");
    expect(page).toContain('.eq("is_unsent", false)');
    expect(page).toContain('.is("removed_at", null)');
    expect(page).toContain('.not("pinned_at", "is", null)');
  });

  it("a stranger gets a 404, not an empty board", () => {
    // RLS already returns nothing; an empty board would read as "they have
    // not pinned anything".
    expect(read("src/app/(app)/messages/[threadId]/pins/page.tsx")).toContain(
      "if (!members?.some((m) => m.user_id === user.id)) notFound();",
    );
  });
});

describe("the board on screen", () => {
  it("the pin is the unpin button", () => {
    // Pulling the pin out is what takes the card down — no second control.
    expect(board).toContain('aria-label="Unpin"');
    expect(board).toContain("onClick={onUnpin}");
  });

  it("a failed unpin puts the card back", () => {
    // The board has to show what is actually pinned, or the next person to
    // open it sees something different.
    expect(board).toContain("setPins(before);");
  });

  it("tapping a card goes back to the message in the thread", () => {
    expect(board).toContain("router.push(`/messages/${threadId}?m=${pin.id}`)");
    // And the thread reaches it the same way a search result is reached.
    expect(chat).toContain('const focus = params.get("m");');
    expect(chat).toContain("void goToMessage({ id: focus } as FoundMessage);");
    // The param is dropped, so a reload or a back does not jump again.
    expect(chat).toContain('url.searchParams.delete("m");');
  });

  it("the side is what the layout actually does with it", () => {
    expect(board).toContain('const right = pin.side === "right";');
    expect(board).toContain('`flex ${right ? "justify-end" : "justify-start"}`');
    // The pin hangs on the outer corner, which is the side the card is on.
    expect(board).toContain("...(right ? { right: 3 } : { left: 3 })");
  });

  it("the thread is drawn solid, because a dashed one would smear", () => {
    // The box is stretched to the column's width, which distorts a dash
    // pattern; non-scaling-stroke keeps the line a hairline through it.
    expect(board).toContain('vectorEffect="non-scaling-stroke"');
    expect(board).not.toContain("strokeDasharray");
  });

  it("an empty board invites the first pin rather than apologising", () => {
    expect(board).toContain('title="Nothing pinned yet"');
    expect(board).toContain("Hold a message in the chat and pin it");
  });

  it("a name only where the side does not already say it", () => {
    // In a one-to-one chat the side is the name, so repeating it is noise.
    expect(board).toContain("isGroup && !pin.mine ? (people[pin.senderId]?.name ?? \"User\") : null");
  });
});

describe("swiping left to the board", () => {
  it("leftward only — rightward over a chat reads as going back", () => {
    expect(opensPinBoard(-PIN_SWIPE_PX, 0)).toBe(true);
    expect(opensPinBoard(PIN_SWIPE_PX * 2, 0)).toBe(false);
  });

  it("a short drag is not a swipe", () => {
    expect(opensPinBoard(-(PIN_SWIPE_PX - 1), 0)).toBe(false);
  });

  it("a scroll that wandered sideways is left alone", () => {
    // Stealing a scroll is worse than missing a swipe — SwipeNav's own bias.
    expect(opensPinBoard(-90, 80)).toBe(false);
    expect(opensPinBoard(-90, 20)).toBe(true);
  });

  it("not while a sheet or a menu is open, and not over a gallery", () => {
    expect(chat).toContain("gestureBlocked(overlayCount(), e.target)");
  });

  it("not a pinch", () => {
    expect(chat).toContain("e.touches.length > 1");
  });

  it("the thread is the one screen with no sideways navigation of its own", () => {
    // SwipeNav matches tab paths exactly, so a chat sub-route has no tab
    // swipe to clash with. If that ever changes, this is the thing to look at.
    expect(read("src/components/layout/SwipeNav.tsx")).toContain(
      "return (TABS as readonly string[]).indexOf(pathname);",
    );
  });

  it("there is also a way in that is not a gesture", () => {
    // A gesture nobody discovers is not a feature.
    expect(chat).toContain('label="Pinned"');
    expect(chat).toContain("router.push(`/messages/${conversationId}/pins`)");
  });
});

describe("a pinned message says so in the thread", () => {
  it("otherwise the only way to know is to go and look", () => {
    expect(chat).toContain("{m.pinned_at && (");
    expect(chat).toContain("Pinned");
    // The thread reads the column, so it knows without asking again.
    expect(chat).toContain("created_at, pinned_at, post:posts(");
  });
});

describe("small print", () => {
  it("file sizes are readable", () => {
    expect(fileSize(2_200_000)).toBe("2.1 MB");
    expect(fileSize(3400)).toBe("3 KB");
    expect(fileSize(null)).toBe("");
    expect(fileSize(0)).toBe("");
  });

  it("a date says as much as is needed to place it", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(pinWhen("2026-10-20T12:00:00Z", now)).toBe("Tue");
    expect(pinWhen("2026-09-14T12:00:00Z", now)).toContain("Sep");
    expect(pinWhen("2025-09-14T12:00:00Z", now)).toContain("2025");
    expect(pinWhen("not a date", now)).toBe("");
  });
});
