import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";

/**
 * Six realtime subscriptions that never received anything.
 *
 * `postgres_changes` only delivers rows for tables in the `supabase_realtime`
 * publication. Four tables were ever added. The app subscribed to three more,
 * and those callbacks were simply unreachable — the channels opened, the
 * handlers were correct, and nothing ever called them. The features degraded
 * quietly rather than breaking, which is why it survived: the inbox still
 * refreshed on new messages, the badge still counted up, the presence dot
 * still showed whatever the server rendered on load.
 *
 * This test is the guard that a subscription cannot be added to a table
 * nobody published. It reads the migrations for publication membership and
 * the components for what they subscribe to, and insists the two agree.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Every table any migration adds to the realtime publication. */
function publishedTables(): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync("supabase/migrations").sort()) {
    if (!f.endsWith(".sql")) continue;
    const sql = read(`supabase/migrations/${f}`);
    for (const m of sql.matchAll(
      /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.(\w+)/gi,
    )) {
      out.add(m[1]);
    }
  }
  return out;
}

/** Every table a component opens a postgres_changes subscription on. */
function subscribedTables(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const files = [
    "src/components/layout/BottomNav.tsx",
    "src/components/messages/InAppNotifier.tsx",
    "src/components/messages/MessagesInbox.tsx",
    "src/components/messages/RealChatView.tsx",
    "src/app/(app)/notifications/page.tsx",
    "src/components/calls/CallProvider.tsx",
    "src/components/calls/GroupCallProvider.tsx",
  ];
  for (const f of files) {
    const src = read(f);
    // Only inside a postgres_changes subscription: a `table:` key that is
    // part of some other object literal is not a subscription.
    for (const m of src.matchAll(/"postgres_changes",[\s\S]{0,320}?table:\s*"(\w+)"/g)) {
      out.set(m[1], [...(out.get(m[1]) ?? []), f]);
    }
  }
  return out;
}

describe("every table the app subscribes to is actually published", () => {
  it("has no subscription to a table the WAL decoder never sees", () => {
    const published = publishedTables();
    const unmatched: string[] = [];
    for (const [table, files] of subscribedTables()) {
      if (!published.has(table)) unmatched.push(`${table} (${files.join(", ")})`);
    }
    expect(unmatched, "subscribed but not in supabase_realtime").toEqual([]);
  });

  it("conversation_members is published, which is what repaired four features", () => {
    // The unread badge, the locked-chat guard in InAppNotifier, the inbox
    // clearing a badge when the thread is read on another device, and
    // RealChatView.
    expect(publishedTables().has("conversation_members")).toBe(true);
  });
});

describe("the two tables that must NOT be published", () => {
  it("profiles stays out: the heartbeat would become a WAL firehose", () => {
    // One record per signed-in user per minute, decoded and RLS-checked for
    // every subscriber, to carry "still here".
    expect(publishedTables().has("profiles")).toBe(false);
  });

  it("conversations stays out: last_message_at only moves when a message lands", () => {
    // Publishing it duplicates the busiest stream in the app to say nothing
    // the messages subscription does not already say.
    expect(publishedTables().has("conversations")).toBe(false);
    const inbox = read("src/components/messages/MessagesInbox.tsx");
    expect(inbox).not.toContain('table: "conversations"');
  });
});

describe("presence travels on a channel instead", () => {
  it("sender and listener derive the same topic from one helper", () => {
    const lib = read("src/lib/presence.ts");
    expect(lib).toContain("export function presenceTopic(userId: string): string");
    expect(read("src/components/presence/PresenceHeartbeat.tsx")).toContain("presenceTopic(userId)");
    expect(read("src/components/messages/RealChatView.tsx")).toContain("presenceTopic(other.id)");
  });

  it("the chat listens for a broadcast, not for a row change", () => {
    const chat = read("src/components/messages/RealChatView.tsx");
    expect(chat).toContain('.on("broadcast", { event: "beat" }');
    expect(chat).not.toContain('table: "profiles"');
  });

  it("a hidden reader is never announced", () => {
    // touch_last_seen stores null for show_activity = false and returns it;
    // the heartbeat sends nothing on a null. The opt-out has to hold on both
    // paths or the dot comes back by the side door.
    const beat = read("src/components/presence/PresenceHeartbeat.tsx");
    expect(beat).toContain("if (!alive || error || !data) return;");
    const sql = read("supabase/migrations/0156_presence_broadcast.sql");
    expect(sql).toContain("case when show_activity is false then null else now() end");
    expect(sql).toContain("returning last_seen_at;");
  });

  it("the broadcast carries the stored timestamp, not the device clock", () => {
    const beat = read("src/components/presence/PresenceHeartbeat.tsx");
    expect(beat).toContain("payload: { at: data as string }");
  });

  it("the heartbeat still writes, for everyone who is not online right now", () => {
    // "Active 4m ago" and the server-rendered initial dot both come from the
    // stored column; only the live update moved to a channel.
    expect(read("src/components/presence/PresenceHeartbeat.tsx")).toContain('supabase.rpc("touch_last_seen")');
  });

  it("and the channel is torn down with the component", () => {
    const beat = read("src/components/presence/PresenceHeartbeat.tsx");
    expect(beat).toContain("void supabase.removeChannel(channel);");
  });
});
