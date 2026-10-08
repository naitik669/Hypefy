// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";

/**
 * Holding a comment, and forwarding one.
 *
 * Three things meet here: the menu a hold opens, the embed a forwarded
 * comment arrives as, and the two database changes both lean on — a post's
 * author being allowed to delete a comment on their own post, and
 * send_message being allowed to name the comment a share is about.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0134_comment_forwarding_and_author_delete.sql");
const sheet = read("src/components/feed/CommentsSheet.tsx");

describe("who may delete a comment", () => {
  it("its own author, or whoever owns the post or Shot it sits on", () => {
    expect(sql).toContain("c.user_id = v_me");
    expect(sql).toContain("exists (select 1 from public.posts p where p.id = c.post_id and p.user_id = v_me)");
    expect(sql).toContain("exists (select 1 from public.shots s where s.id = c.shot_id and s.user_id = v_me)");
  });

  it("soft, and never twice — an answer of false is a refusal", () => {
    expect(sql).toContain("set deleted_at = now()");
    expect(sql).toContain("and c.deleted_at is null");
    expect(sql).toContain("and c.removed_at is null");
    expect(sql).toContain("return v_n > 0;");
  });

  it("nobody but a signed-in person can call it", () => {
    expect(sql).toContain("revoke all on function public.delete_comment(uuid) from public, anon;");
    expect(sql).toContain("grant execute on function public.delete_comment(uuid) to authenticated;");
  });

  it("the sheet asks the function rather than writing the column", () => {
    // A zero-row update is not an error, so an RLS refusal used to arrive
    // looking like success. The function answers the question directly.
    expect(sheet).toContain('supabase.rpc("delete_comment", { p_id: id })');
    expect(sheet).toContain("if (error || data !== true) {");
    expect(sheet).not.toContain('.update({ deleted_at: new Date().toISOString() })');
  });
});

describe("naming the comment a share is about", () => {
  it("only when the comment really sits on the thing being sent", () => {
    expect(sql).toContain("if p_kind in ('post', 'shot') and p_comment_id is not null and exists (");
    expect(sql).toContain("and ((p_kind = 'post' and c.post_id = p_post_id)");
    expect(sql).toContain("or (p_kind = 'shot' and c.shot_id = p_shot_id))");
    expect(sql).toContain("v_meta := v_meta || jsonb_build_object('comment_id', p_comment_id);");
  });

  it("the slide a post was shared on still survives beside it", () => {
    // The two are built in sequence onto the same object, not either/or.
    expect(sql).toContain("v_meta := jsonb_build_object(\n      'slide'");
    expect(sql.indexOf("'slide'")).toBeLessThan(sql.indexOf("'comment_id', p_comment_id"));
  });

  it("the person told about it hears it was a comment, not a post", () => {
    expect(sql).toContain("when v_meta ? 'comment_id' then 'forwarded a comment to you'");
  });

  it("the share sheet passes it along for both posts and Shots", () => {
    const share = read("src/components/feed/ShareSheet.tsx");
    expect(share.split("p_comment_id: commentId,").length - 1).toBe(2);
    // Forwarding is only ever to people: a link or a Show would carry the
    // post and quietly drop the one thing the sender picked.
    expect(share).toContain("  ) : sent.size > 0 || commentId ? (");
    expect(share).toContain('title={commentId ? "Forward to" : "Send to"}');
    expect(share).toContain("disabled={sendingDm || sent.size === 0}");
  });

  it("the chat keeps the id, never a copy of the words", () => {
    const chat = read("src/components/messages/RealChatView.tsx");
    expect(chat).toContain("comment_id?: string;");
    expect(chat).toContain('.select("id, body, user_id, profiles(display_name, username, avatar_hue, avatar_url)")');
    expect(chat).toContain('.is("deleted_at", null)');
    // Asked-for ids live in a ref so a miss is not asked for again, and so
    // the effect's dependencies do not include what the effect writes.
    expect(chat).toContain("fwdAsked.current.add(id)");
    expect(chat).toContain("}, [messages, supabase]);");
  });
});

describe("what the label above a forwarded comment says", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  async function label(props: Record<string, unknown>) {
    const { ForwardedLabel } = await import("@/components/messages/ForwardedComment");
    await act(async () => root.render(createElement(ForwardedLabel, props as never)));
    return host.textContent ?? "";
  }

  const base = {
    mine: true,
    senderUsername: "naitik",
    commentAuthorUsername: "riya",
    commentIsYours: false,
    contentAuthorUsername: "aman",
    contentIsYours: false,
    kind: "post" as const,
  };

  it("mine reads as 'I', theirs by their handle", async () => {
    expect(await label(base)).toBe("I forwarded @riya’s comment on @aman’s post");
    expect(await label({ ...base, mine: false })).toBe(
      "@naitik forwarded @riya’s comment on @aman’s post",
    );
  });

  it("the reader is never shown their own handle", async () => {
    expect(await label({ ...base, contentIsYours: true })).toBe(
      "I forwarded @riya’s comment on your post",
    );
    expect(await label({ ...base, mine: false, commentIsYours: true })).toBe(
      "@naitik forwarded your comment on @aman’s post",
    );
  });

  it("a comment on its own author's post does not name them twice", async () => {
    expect(await label({ ...base, commentAuthorUsername: "aman" })).toBe(
      "I forwarded @aman’s comment on their own post",
    );
  });

  it("a Shot is called a Shot", async () => {
    expect(await label({ ...base, kind: "shot" })).toBe(
      "I forwarded @riya’s comment on @aman’s Shot",
    );
  });

  it("someone with no handle left is still someone", async () => {
    expect(await label({ ...base, commentAuthorUsername: null })).toBe(
      "I forwarded someone’s comment on @aman’s post",
    );
  });
});

describe("the bar that leads a label", () => {
  const src = read("src/components/ui/EmbedLabel.tsx");

  it("takes a name's colour, not white, from one place", () => {
    // bg-current plus the same text token is what stops the two drifting:
    // there is no second colour to keep in step.
    expect(src).toContain('const NAME = "text-foreground/80";');
    expect(src).toContain("bg-current ${NAME}");
    expect(src).not.toContain("bg-white");
  });

  it("is a thin rule, not a bold slab", () => {
    expect(src).toContain('className={`h-[11px] w-[2px] shrink-0 rounded-full bg-current ${NAME}`}');
  });

  it("the page replies and reactions wear it too", () => {
    const page = read("src/components/diary/PageReplyEmbed.tsx");
    expect(page).toContain('<EmbedLabel align={mine ? "end" : "start"}>{what}</EmbedLabel>');
    expect(page).not.toContain('text-[11px] font-semibold text-muted">{what}');
  });
});

describe("the bubble laid over the card", () => {
  const src = read("src/components/messages/ForwardedComment.tsx");

  it("sits over the card, reaching past its left edge", () => {
    expect(src).toContain("const OVERHANG = 10;");
    expect(src).toContain("const INSET_RIGHT = 22;");
    expect(src).toContain("style={{ paddingLeft: OVERHANG, paddingBottom: 18 }}");
  });

  it("shows no seam where the point meets the bubble", () => {
    // One colour, no border on either part: there is no line to see.
    expect(src).toContain("rounded-[14px] bg-elevated");
    expect(src).toContain('className="absolute left-[22px] top-[-5px] h-3 w-3 rotate-45 rounded-[2px] bg-elevated"');
    expect(src).not.toContain("border-border");
  });

  it("two lines, then there is more to read", () => {
    expect(src).toContain("line-clamp-2");
    expect(src).toContain("setOverflows(el.scrollHeight - el.clientHeight > 2);");
    expect(src).toContain("{overflows && (");
    expect(src).toContain("more…");
    // At the end of the second line, not on a third of its own, with the
    // bubble's colour fading in over whatever word got clipped.
    expect(src).toContain("absolute bottom-0 right-0 bg-gradient-to-r from-transparent via-elevated");
  });

  it("a press lands on the card beneath, not on the bubble", () => {
    expect(src).toContain("pointer-events-none absolute bottom-0 left-0");
  });

  it("a comment since deleted says so rather than vanishing", () => {
    expect(src).toContain("This comment was deleted");
  });
});

describe("the menu a held comment opens", () => {
  const src = read("src/components/feed/HeldCommentMenu.tsx");

  it("lifts the comment to the middle, with the thread blurred behind", () => {
    expect(src).toContain("fixed inset-0 z-[220] flex items-center justify-center");
    expect(src).toContain("bg-black/70 backdrop-blur-md");
    expect(src).toContain("animate-held-lift");
  });

  it("no longer depends on where the thumb was", () => {
    // The old menu opened at the press point and ran off the bottom of the
    // screen, hiding the very comment it was about.
    expect(sheet).toContain("const [actionOn, setActionOn] = useState<{ node: Node; threadId: string } | null>(null);");
    expect(sheet).not.toContain("window.innerHeight : 800) - 210");
    expect(src).not.toContain("clientX");
  });

  it("options run down a column, bare, as the post peek's do", () => {
    // No tile around each one: boxing six options left most of the screen
    // empty around a small grid and made them read as a keypad.
    expect(src).toContain('<div className="flex flex-col">');
    expect(src).toContain("<a.icon size={21}");
    expect(src).toContain("animationDelay: `${40 + i * 22}ms`");
    expect(src).not.toContain("grid-cols-3");
    expect(src).not.toContain("bg-elevated text-[10.5px]");
  });

  it("the comment takes the width it can have", () => {
    expect(src).toContain('const MAX_W = "440px";');
    expect(src).toContain('className="animate-held-lift relative flex w-full flex-col gap-4" style={{ maxWidth: MAX_W }}');
  });

  it("only what removes something is marked dangerous", () => {
    expect(src).toContain('a.danger ? "text-danger" : "text-white/90"');
    // Reporting costs the reader nothing and undoes nothing, so only
    // Delete carries the mark. Two reds side by side also make the one that
    // really removes something easy to hit by accident.
    const report = sheet.slice(sheet.indexOf('key: "report"'), sheet.indexOf('key: "delete"'));
    expect(report).toContain('label: "Report",');
    expect(report).not.toContain("danger: true");
    expect(sheet.slice(sheet.indexOf('key: "delete"'))).toContain("danger: true");
  });

  it("holding is not the only way in", () => {
    expect(sheet).toContain('aria-label="Comment options"');
    expect(sheet).toContain("onClick={() => onLongPress(node, threadId)}");
  });
});

describe("which actions a held comment offers", () => {
  it("pinning belongs to the post's author, who can delete as well as report", () => {
    expect(sheet).toContain("const isPostOwner = !!currentUserId && currentUserId === postOwnerId;");
    expect(sheet).toContain("if (isPostOwner) {");
    // Report is for anyone but the comment's own author; Delete for its
    // author or the post's. So the post's author sees both, deliberately:
    // taking it off your post and telling us about it are different acts.
    expect(sheet).toContain("if (!own) {");
    expect(sheet).toContain("if (own || isPostOwner) {");
  });

  it("forwarding is offered on every comment, media included", () => {
    // The post travels either way, so there is always something to send.
    expect(sheet).toContain('key: "forward",');
    expect(sheet).toContain("setForwarding(node.id);");
    expect(sheet).toContain("commentId={forwarding}");
  });

  it("copying and editing need words", () => {
    expect(sheet).toContain("if (words) {");
    expect(sheet).toContain("if (own && words) {");
  });
});
