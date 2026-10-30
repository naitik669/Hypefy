import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isEmbedType, readLayers } from "@/lib/show-layers";

const editor = readFileSync("src/components/shows/ShowEditor.tsx", "utf8");
const viewer = readFileSync("src/components/shows/ShowViewer.tsx", "utf8");
const view = readFileSync("src/components/shows/LayerView.tsx", "utf8");

const layer = (type: string, payload: Record<string, unknown>) => ({ id: "e", type, x: 0.5, y: 0.5, scale: 1, rotation: 0, payload });

describe("a post, a Shot or a Spotlight page on a Show", () => {
  it("keeps a style it offers, and refuses others", () => {
    expect(readLayers([layer("shot", { shotId: "s1", style: "bubble" })])[0].payload).toEqual({ shotId: "s1", style: "bubble" });
    expect(readLayers([layer("post", { postId: "p1", style: "huge" })])[0].payload).toEqual({ postId: "p1" });
  });

  it("a Spotlight page is the owner's id, and nothing copied", () => {
    expect(readLayers([layer("spotlight", { ownerId: "u1", text: "copied" })])[0].payload).toEqual({ ownerId: "u1" });
    expect(isEmbedType("spotlight")).toBe(true);
    expect(isEmbedType("music")).toBe(false);
  });

  it("is one per Show: a second replaces the first, where it was", () => {
    expect(editor).toContain("const old = layers.find((l) => isEmbedType(l.type)) ?? null;");
    expect(editor).toContain("if (id && old) update(id, { x: old.x, y: old.y, scale: old.scale, rotation: old.rotation });");
  });

  it("a Shot plays where it sits, muted and round and round", () => {
    expect(view).toContain("<ShotLoop src={embed!.video!}");
    expect(view).toMatch(/<video[\s\S]*?autoPlay[\s\S]*?muted[\s\S]*?loop[\s\S]*?playsInline/);
    expect(viewer).toContain("video: s.media_url ?? null,");
  });

  it("a Spotlight page is read through get_notes, which decides who may see it", () => {
    expect(viewer).toContain('wantsSpotlight ? supabase.rpc("get_notes")');
    expect(view).toContain("/messages/spotlight?page=${encodeURIComponent(ownerId)}");
  });
});

describe("a reply to a Show, in DMs", () => {
  it("carries which Show, and the words are only the words", () => {
    expect(viewer).toContain("p_metadata: { show_id: show.id },");
    expect(viewer).not.toContain("↩️ Replied to your Show:");
  });

  it("is only kept when the sender can see that Show", () => {
    const sql = readFileSync("supabase/migrations/0191_show_reply_in_dm.sql", "utf8");
    expect(sql).toContain("and public.can_see_show((p_metadata ->> 'show_id')::uuid) then");
  });

  it("and the chat draws the Show above the reply", () => {
    const chat = readFileSync("src/components/messages/RealChatView.tsx", "utf8");
    expect(chat).toContain("<ShowReplyCard showId={m.metadata.show_id} mine={mine} />");
  });
});
