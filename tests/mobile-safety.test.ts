import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  BLOCK_COPY,
  MAX_REPORT_DETAILS,
  REPORT_LABELS,
  REPORT_REASONS,
  blockUser,
  isBlockedByMe,
  submitReport,
  unblockUser,
  type SafetyClient,
} from "../packages/core/src/safety";
import { safetyRows, type SafetyTarget } from "../apps/mobile/src/safety/menu";

/**
 * Report and block on the phone.
 *
 * Play's user-generated-content policy requires both, in the app, on the
 * content people post. The writes are shared with the web through
 * @hypefy/core/safety and driven here with a fake client; the screens are
 * read as source only for what cannot be run without a device — that a
 * control exists and is wired.
 */

type Call = { op: string; table?: string; fn?: string; args?: unknown; filters: [string, unknown][] };

/** A client that records what it was asked and answers with `answer`. */
function fake(answer: { data?: unknown; error: { code?: string; message?: string } | null }) {
  const calls: Call[] = [];
  const filterable = (call: Call) => {
    const f = {
      eq(column: string, value: unknown) {
        call.filters.push([column, value]);
        return f;
      },
      maybeSingle: () => Promise.resolve(answer),
      then<A = typeof answer, B = never>(
        ok?: ((r: typeof answer) => A | PromiseLike<A>) | null,
        bad?: ((e: unknown) => B | PromiseLike<B>) | null,
      ) {
        return Promise.resolve(answer).then(ok, bad);
      },
    };
    return f;
  };
  const client: SafetyClient = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ op: "insert", table, args: row, filters: [] });
          return Promise.resolve(answer);
        },
        select(columns: string) {
          const call: Call = { op: "select", table, args: columns, filters: [] };
          calls.push(call);
          return filterable(call);
        },
        delete() {
          const call: Call = { op: "delete", table, filters: [] };
          calls.push(call);
          return filterable(call);
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ op: "rpc", fn, args, filters: [] });
      return Promise.resolve(answer);
    },
  };
  return { client, calls };
}

const ME = "me-0000";
const THEM = "them-0000";

describe("submitReport", () => {
  it("writes one open row to reports, as the reporter, with trimmed details", async () => {
    const { client, calls } = fake({ error: null });
    const out = await submitReport(client, {
      reporterId: ME,
      targetType: "post",
      targetId: "post-1",
      reason: "Spam",
      details: "  selling followers  ",
    });
    expect(out).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ op: "insert", table: "reports" });
    expect(calls[0].args).toEqual({
      reporter_id: ME,
      target_type: "post",
      target_id: "post-1",
      reason: "Spam",
      details: "selling followers",
      status: "open",
    });
  });

  it("blank details are stored as null, not as an empty string", async () => {
    const { client, calls } = fake({ error: null });
    await submitReport(client, {
      reporterId: ME,
      targetType: "comment",
      targetId: "c-1",
      reason: "Other",
      details: "   ",
    });
    expect((calls[0].args as { details: unknown }).details).toBeNull();
  });

  it("details past the limit are cut, not refused", async () => {
    const { client, calls } = fake({ error: null });
    await submitReport(client, {
      reporterId: ME,
      targetType: "profile",
      targetId: THEM,
      reason: "Other",
      details: "x".repeat(MAX_REPORT_DETAILS + 50),
    });
    expect((calls[0].args as { details: string }).details).toHaveLength(MAX_REPORT_DETAILS);
  });

  it("a repeat report (unique violation) counts as sent", async () => {
    const { client } = fake({ error: { code: "23505", message: "duplicate key" } });
    const out = await submitReport(client, {
      reporterId: ME,
      targetType: "shot",
      targetId: "s-1",
      reason: "Spam",
    });
    expect(out).toEqual({ ok: true });
  });

  it("any other failure is a failure, with the reason", async () => {
    const { client } = fake({ error: { code: "42501", message: "permission denied" } });
    const out = await submitReport(client, {
      reporterId: ME,
      targetType: "post",
      targetId: "p-1",
      reason: "Spam",
    });
    expect(out).toEqual({ ok: false, error: "permission denied" });
  });

  it("refuses without a reporter, a target or a reason, and writes nothing", async () => {
    for (const input of [
      { reporterId: "", targetType: "post" as const, targetId: "p", reason: "Spam" },
      { reporterId: ME, targetType: "post" as const, targetId: "", reason: "Spam" },
      { reporterId: ME, targetType: "post" as const, targetId: "p", reason: "  " },
    ]) {
      const { client, calls } = fake({ error: null });
      const out = await submitReport(client, input);
      expect(out.ok).toBe(false);
      expect(calls).toHaveLength(0);
    }
  });
});

describe("blocking", () => {
  it("blockUser calls block_user with the target", async () => {
    const { client, calls } = fake({ error: null });
    expect(await blockUser(client, ME, THEM)).toEqual({ ok: true });
    expect(calls).toEqual([
      { op: "rpc", fn: "block_user", args: { p_blocked: THEM }, filters: [] },
    ]);
  });

  it("a failed block is said, not shown as done", async () => {
    const { client } = fake({ error: { message: "boom" } });
    expect(await blockUser(client, ME, THEM)).toEqual({ ok: false, error: BLOCK_COPY.failed });
  });

  it("you cannot block yourself, and no call is made", async () => {
    const { client, calls } = fake({ error: null });
    expect((await blockUser(client, ME, ME)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("unblockUser deletes only the viewer's own row for that person", async () => {
    const { client, calls } = fake({ error: null });
    expect(await unblockUser(client, ME, THEM)).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ op: "delete", table: "blocked_users" });
    expect(calls[0].filters).toEqual([
      ["blocker_id", ME],
      ["blocked_id", THEM],
    ]);
  });

  it("a failed unblock is said", async () => {
    const { client } = fake({ error: { message: "boom" } });
    expect(await unblockUser(client, ME, THEM)).toEqual({
      ok: false,
      error: BLOCK_COPY.unblockFailed,
    });
  });

  it("isBlockedByMe reads the viewer's own row, and a failed read says no", async () => {
    const yes = fake({ data: { id: "b1" }, error: null });
    expect(await isBlockedByMe(yes.client, ME, THEM)).toBe(true);
    expect(yes.calls[0].filters).toEqual([
      ["blocker_id", ME],
      ["blocked_id", THEM],
    ]);
    expect(await isBlockedByMe(fake({ data: null, error: null }).client, ME, THEM)).toBe(false);
    expect(
      await isBlockedByMe(fake({ data: { id: "b1" }, error: { message: "x" } }).client, ME, THEM),
    ).toBe(false);
  });
});

describe("what the phone's menu offers", () => {
  const post: SafetyTarget = { type: "post", id: "p1", authorId: THEM, username: "ana" };
  const keys = (t: SafetyTarget, viewer: string | null, blocked = false) =>
    safetyRows(t, viewer, blocked).map((r) => r.key);

  it("a post or a Shot: report it, or block its author", () => {
    expect(keys(post, ME)).toEqual(["report", "block"]);
    expect(keys({ ...post, type: "shot" }, ME)).toEqual(["report", "block"]);
  });

  it("a profile: block (or unblock once blocked), then report", () => {
    const profile: SafetyTarget = { type: "profile", id: THEM, authorId: THEM, username: "ana" };
    expect(keys(profile, ME)).toEqual(["block", "report"]);
    expect(keys(profile, ME, true)).toEqual(["unblock", "report"]);
  });

  it("a comment: report only, as the web's held-comment actions", () => {
    expect(keys({ ...post, type: "comment" }, ME)).toEqual(["report"]);
  });

  it("nothing on your own content, and nothing when signed out", () => {
    expect(keys({ ...post, authorId: ME }, ME)).toEqual([]);
    expect(keys(post, null)).toEqual([]);
  });

  it("the words are the website's", () => {
    const rows = safetyRows(post, ME);
    expect(rows.map((r) => r.label)).toEqual(["Report post", "Block @ana"]);
    expect(safetyRows({ ...post, type: "shot" }, ME)[0].label).toBe("Report Shot");
    const profile = safetyRows({ type: "profile", id: THEM, authorId: THEM, username: "ana" }, ME);
    expect(profile.map((r) => r.label)).toEqual(["Block @ana", "Report @ana"]);
    expect(profile[1].sub).toBe("They won't know it came from you");
    // No username still names someone rather than printing "@undefined".
    expect(safetyRows({ ...post, username: null }, ME)[1].label).toBe("Block @user");
  });
});

/** Comments and imports gone — both have stood in for code in this repo. */
function body(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

describe("one set of words and reasons for both clients", () => {
  it("the web's report sheet writes through the shared function", () => {
    const web = body("src/components/ui/ReportSheet.tsx");
    expect(web).toMatch(/await submitReport\(/);
    expect(web, "the web is inserting reports itself again").not.toMatch(/from\("reports"\)/);
    expect(web, "the web keeps its own reasons again").not.toMatch(/"Harassment or bullying"/);
  });

  it("the reasons and labels are the ones the web always offered", () => {
    expect(REPORT_REASONS).toEqual([
      "Spam",
      "Harassment or bullying",
      "Hate or abuse",
      "Scam or fraud",
      "Nudity or sexual content",
      "Violence or dangerous acts",
      "Misinformation",
      "Other",
    ]);
    expect(REPORT_LABELS.profile).toBe("account");
  });

  it("the block confirmation says what the web's says", () => {
    const web = readFileSync("src/components/feed/PostActionsSheet.tsx", "utf8");
    expect(web).toContain(`body="${BLOCK_COPY.body}"`);
  });
});

describe("every surface the phone shows content on has the menu, wired", () => {
  const menu = "apps/mobile/src/safety/SafetyMenu.tsx";

  it("the sheet sends the report, the block and the unblock through core", () => {
    const src = body(menu);
    expect(src).toMatch(/await submitReport\(supabase as never, \{[\s\S]*?targetType: target\.type,[\s\S]*?targetId: target\.id,/);
    expect(src).toMatch(/await blockUser\(supabase as never, viewerId, target\.authorId\)/);
    expect(src).toMatch(/await unblockUser\(supabase as never, viewerId, target\.authorId\)/);
    // The block only reaches the screen once it is written.
    expect(src).toMatch(/if \(!result\.ok\) \{\s*setProblem\(result\.error\);\s*return;\s*\}\s*onBlocked\?\.\(target\.authorId\);/);
  });

  it("the feed card opens it on a post, and the feed drops a blocked author", () => {
    const card = body("apps/mobile/src/feed/FeedCard.tsx");
    expect(card).toMatch(/onPress=\{\(\) => setMenuOpen\(true\)\}/);
    expect(card).toMatch(/<SafetyMenu[\s\S]*?target=\{target\}[\s\S]*?onBlocked=\{onBlocked\}/);
    expect(card).toMatch(/type: "post" as const,\s*id: post\.id,\s*authorId: post\.user_id,/);
    const home = body("apps/mobile/app/(tabs)/home.tsx");
    expect(home).toMatch(/prev\?\.filter\(\(p\) => p\.user_id !== userId\)/);
    expect(home).toMatch(/onBlocked=\{dropAuthor\}/);
    expect(home).toMatch(/viewerId=\{viewerId\}/);
  });

  it("a Shot has it on the rail, and its author's Shots leave the reel", () => {
    const shots = body("apps/mobile/app/(tabs)/shots.tsx");
    expect(shots).toMatch(/type: "shot" as const,\s*id: shot\.id,\s*authorId: shot\.user_id,/);
    expect(shots).toMatch(/onPress=\{\(\) => setMenuOpen\(true\)\}/);
    expect(shots).toMatch(/prev\?\.filter\(\(s\) => s\.user_id !== userId\)/);
  });

  it("a profile has it in the bar, and a block leaves the profile", () => {
    const profile = body("apps/mobile/app/u/[username].tsx");
    expect(profile).toMatch(/target=\{\{ type: "profile", id: p\.id, authorId: p\.id/);
    expect(profile).toMatch(/onBlocked=\{\(\) => router\.replace\("\/home"\)\}/);
    expect(profile).toMatch(/\{right \?\? <View style=\{styles\.back\} \/>\}/);
  });

  it("a comment opens it on a long press", () => {
    const comments = body("apps/mobile/app/post/[id]/comments.tsx");
    expect(comments).toMatch(/onLongPress=\{\(\) => onHold\(node\)\}/);
    expect(comments).toMatch(/onHold=\{hold\}/);
    expect(comments).toMatch(/type: "comment",\s*id: held\.id,\s*authorId: held\.user_id,/);
  });
});
