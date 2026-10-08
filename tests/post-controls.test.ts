import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  loadArchive,
  parseArchive,
  setArchived,
  setCommentsOff,
  wasEdited,
  type ArchivedItem,
} from "@/lib/post-controls";

/**
 * What an author can do to their own work after posting it: archive it, stop
 * comments on it, and change the words of a comment — with the change said
 * out loud.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql = read("supabase/migrations/0131_archive_edit_and_comment_controls.sql");

/** A Supabase client that answers rpc() with whatever is handed in. */
function client(answer: { data?: unknown; error?: unknown } = {}) {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { rpc, client: { rpc } as never };
}

describe("archiving and unarchiving", () => {
  it("asks the one function that is allowed to, with the right words", async () => {
    const a = client();
    expect(await setArchived(a.client, "post", "p1", true)).toBeNull();
    expect(a.rpc).toHaveBeenCalledWith("set_archived", { p_kind: "post", p_id: "p1", p_archived: true });
  });

  it("says which way it failed", async () => {
    const a = client({ error: { message: "nope" } });
    expect(await setArchived(a.client, "shot", "s1", true)).toContain("archive");
    expect(await setArchived(a.client, "shot", "s1", false)).toContain("put that back");
  });

  it("never passes the server's own words to the reader", async () => {
    const a = client({ error: { message: "ERROR: permission denied for table posts" } });
    expect(await setArchived(a.client, "post", "p1", true)).not.toContain("permission denied");
  });
});

describe("comments off", () => {
  it("asks for the post or the Shot by kind", async () => {
    const a = client();
    expect(await setCommentsOff(a.client, "shot", "s1", true)).toBeNull();
    expect(a.rpc).toHaveBeenCalledWith("set_comments_off", { p_kind: "shot", p_id: "s1", p_off: true });
  });
  it("says so when it could not", async () => {
    expect(await setCommentsOff(client({ error: {} }).client, "post", "p", false)).toContain("Couldn't");
  });
});

describe("reading the archive", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    kind: "post",
    id: "p1",
    caption: "hello",
    thumb: "t.jpg",
    media_url: null,
    archived_at: "2026-10-08T10:00:00Z",
    ...over,
  });

  it("keeps the rows it understands", () => {
    expect(parseArchive([row(), row({ kind: "shot", id: "s1", media_url: "clip.mp4" })])).toEqual<ArchivedItem[]>([
      { kind: "post", id: "p1", caption: "hello", thumb: "t.jpg", media_url: null, archived_at: "2026-10-08T10:00:00Z" },
      { kind: "shot", id: "s1", caption: "hello", thumb: "t.jpg", media_url: "clip.mp4", archived_at: "2026-10-08T10:00:00Z" },
    ]);
  });

  it("drops anything it does not", () => {
    expect(parseArchive(null)).toEqual([]);
    expect(parseArchive("x")).toEqual([]);
    expect(parseArchive([null, 7, { kind: "show", id: "a" }, { kind: "post" }])).toEqual([]);
  });

  it("a post with no words or picture still comes back", () => {
    expect(parseArchive([row({ caption: null, thumb: null })])[0]).toMatchObject({ caption: null, thumb: null });
  });

  it("an archive that cannot be read is empty, not a crash", async () => {
    expect(await loadArchive(client({ error: {} }).client)).toEqual([]);
  });
});

describe("the edited mark", () => {
  const t0 = "2026-10-08T10:00:00.000Z";
  it("is off until the words actually change", () => {
    expect(wasEdited(t0, null)).toBe(false);
    expect(wasEdited(t0, t0)).toBe(false);
    // Two stamps written by the same statement are not an edit.
    expect(wasEdited(t0, "2026-10-08T10:00:00.400Z")).toBe(false);
  });
  it("is on once it has been rewritten", () => {
    expect(wasEdited(t0, "2026-10-08T10:05:00.000Z")).toBe(true);
  });
  it("ignores a time it cannot read", () => {
    expect(wasEdited("nonsense", t0)).toBe(false);
    expect(wasEdited(t0, "nonsense")).toBe(false);
  });
});

describe("what the database guarantees", () => {
  it("archived is hidden from everyone, its owner included", () => {
    for (const table of ["posts", "shots"]) {
      const policy = sql.slice(sql.indexOf(`create policy "${table}: anyone can read"`));
      expect(policy.slice(0, 200)).toContain("archived_at is null");
    }
    // No owner exception, or it would still show in their own feed.
    expect(sql).not.toContain("archived_at is null or user_id");
  });

  it("only the owner can archive, and only their own", () => {
    expect(sql).toContain("where id = p_id and user_id = v_me");
    expect(sql).toContain("if v_n = 0 then raise exception 'Not yours to archive'; end if;");
  });

  it("comments off is enforced on the table, not only in the function", () => {
    expect(sql).toContain("create trigger comments_refuse_when_off before insert on public.comments");
    // Its author can still answer the people who commented before it was shut.
    expect(sql).toContain("new.user_id is distinct from v_owner");
  });

  it("the edited stamp is the database's, so an edit cannot be hidden", () => {
    expect(sql).toContain("if new.body is distinct from old.body then new.updated_at = now(); end if;");
    expect(sql).toContain("create trigger comments_mark_edited before update on public.comments");
  });

  it("a comment cannot be emptied or moved to another post by an edit", () => {
    expect(sql).toContain("raise exception 'A comment cannot be empty'");
    expect(sql).toContain("new.post_id = old.post_id;");
    expect(sql).toContain("new.shot_id = old.shot_id;");
  });

  it("counters and moderation are taken away table-wide first, then given back by name", () => {
    for (const table of ["posts", "shots", "comments"]) {
      const at = sql.indexOf(`revoke update on public.${table} from authenticated, anon;`);
      expect(at).toBeGreaterThan(0);
      const granted = sql.slice(at, sql.indexOf(";", sql.indexOf("grant update", at)));
      for (const col of ["hype_count", "removed_at", "removed_by", "user_id", "archived_at"]) {
        expect(granted).not.toContain(col);
      }
    }
    // What the app does write is still writable.
    expect(sql).toMatch(/grant update \([^)]*caption[^)]*\) on public\.posts to authenticated/);
    expect(sql).toMatch(/grant update \([^)]*in_showcase[^)]*\) on public\.shots to authenticated/);
    expect(sql).toMatch(/grant update \([^)]*deleted_at[^)]*\) on public\.comments to authenticated/);
  });
});

describe("where it is reached from", () => {
  it("a post's menu offers archive and comments on or off, to its author only", () => {
    const menu = read("src/components/feed/PostActionsSheet.tsx");
    const own = menu.slice(menu.indexOf("{isOwn && (\n          <>\n            <MenuDivider />"));
    expect(own).toContain('label="Archive"');
    expect(own).toContain('label={commentsOff ? "Turn comments on" : "Turn comments off"}');
    expect(menu).toContain('if (!open || !isOwn) return;');
  });

  it("a Shot's menu offers its caption, archive and comments too", () => {
    const reels = read("src/components/shots/ReelsFeed.tsx");
    expect(reels).toContain("Edit caption");
    expect(reels).toContain("void archiveShot()");
    expect(reels).toContain("void toggleShotComments()");
    // Archiving takes it off this screen the way deleting does.
    expect(reels).toContain("setDeleted(true);\n    showToast(\"Moved to your archive\");\n    onBack();");
  });

  it("a comment can be rewritten, and says so afterwards", () => {
    const sheet = read("src/components/feed/CommentsSheet.tsx");
    expect(sheet).toContain('supabase.rpc("edit_comment", { p_id: id, p_body: body })');
    expect(sheet).toContain('label: "Edit"');
    expect(sheet).toContain('wasEdited(node.created_at, node.updated_at) && " · edited"');
    // Yours, and words — a photo or GIF comment has nothing to rewrite.
    expect(sheet).toContain("if (own && words) {");
    expect(sheet).toContain('const words = !mediaBody(node.body) && node.body.trim() !== "";');
  });

  it("a shut thread offers no composer, but its author can still answer", () => {
    const sheet = read("src/components/feed/CommentsSheet.tsx");
    expect(sheet).toContain("commentsOff && currentUserId !== postOwnerId ? (");
    expect(sheet).toContain("Comments are off for this one.");
  });

  it("the archive has its own screen, and a way back from it", () => {
    expect(read("src/app/(app)/settings/page.tsx")).toContain('href: "/settings/archive"');
    const list = read("src/components/profile/ArchiveList.tsx");
    expect(list).toContain("setArchived(supabase, item.kind, item.id, false)");
    expect(list).toContain("Put back");
  });
});
