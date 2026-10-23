import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * One realtime channel for the shell, instead of three.
 *
 * BottomNav and InAppNotifier are in the app layout, so they are mounted on
 * every page; MessagesInbox joins them on /messages. Each opened its own
 * channel carrying an UNFILTERED `messages` INSERT subscription. A filter is
 * what lets Realtime discard a change cheaply — without one, every insert
 * anywhere in the app is matched against each subscription and RLS is
 * evaluated per subscription per subscriber. The same question, asked three
 * times, about every message every other user sends.
 *
 * They cannot simply be filtered: "messages in conversations I belong to" is
 * a join, not a column match. So the shell asks once and hands the rows out.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Every unfiltered postgres_changes subscription on `messages`, anywhere. */
function unfilteredMessageSubscriptions(): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
        const src = read(full);
        for (const m of src.matchAll(/\{[^{}]*table:\s*"messages"[^{}]*\}/g)) {
          // `schema:` is what makes it a subscription descriptor rather than
          // some other object that happens to have a `table` key — the admin
          // reports page has one of those.
          if (!m[0].includes("schema:")) continue;
          if (!m[0].includes("filter:")) hits.push(full);
        }
      }
    }
  };
  walk("src");
  return hits;
}

describe("the shell holds one subscription, not three", () => {
  it("only the shared provider subscribes to messages without a filter", () => {
    expect(unfilteredMessageSubscriptions()).toEqual([
      "src/components/messages/MessageStream.tsx",
    ]);
  });

  it("the per-conversation one is untouched, because it is already filtered", () => {
    // Scoped to one open thread by conversation_id — the cheap case, and the
    // one that must keep working on its own.
    const chat = read("src/components/messages/RealChatView.tsx");
    expect(chat).toContain('table: "messages", filter: `conversation_id=eq.${conversationId}`');
  });

  it("the three consumers register with the provider instead", () => {
    for (const [file, hook] of [
      ["src/components/layout/BottomNav.tsx", "useMessageInsert("],
      ["src/components/messages/InAppNotifier.tsx", "useMessageInsert("],
      ["src/components/messages/MessagesInbox.tsx", "useMessageInsert("],
    ] as const) {
      expect(read(file), file).toContain(hook);
      expect(read(file), file).not.toContain(".channel(`inbox-realtime");
    }
  });

  it("the provider wraps everything that listens", () => {
    // BottomNav, InAppNotifier and `children` — which is where the inbox
    // mounts — all have to be inside it, or the hooks silently do nothing.
    const layout = read("src/app/(app)/layout.tsx");
    const open = layout.indexOf("<MessageStreamProvider");
    const close = layout.indexOf("</MessageStreamProvider>");
    expect(open).toBeGreaterThan(-1);
    // `{children}` appears twice: once in the bare shell rendered for a
    // signed-out visitor on a public page, which has no provider and needs
    // none. The one that matters is inside SwipeNav.
    for (const inside of ["<InAppNotifier", "<BottomNav", "<SwipeNav>{children}</SwipeNav>"]) {
      const at = layout.indexOf(inside);
      expect(at, inside).toBeGreaterThan(open);
      expect(at, inside).toBeLessThan(close);
    }
  });
});

describe("the dispatcher", () => {
  const src = read("src/components/messages/MessageStream.tsx");

  it("carries which kind of change produced the row", () => {
    // The inbox refreshes on any reaction event; a banner is only for a new
    // one. Collapsing them would make the notifier toast on un-reacts.
    expect(src).toContain('event: "INSERT" | "UPDATE" | "DELETE"');
    expect(read("src/components/messages/InAppNotifier.tsx")).toContain('if (event === "INSERT")');
  });

  it("uses the old row when a delete has no new one", () => {
    expect(src).toContain("(p.new ?? p.old) as Row");
  });

  it("one listener throwing does not stop the others", () => {
    expect(src).toContain("for (const handler of [...set.current])");
    expect(src).toContain("try {");
  });

  it("iterates a copy, so a handler that unregisters mid-fan is safe", () => {
    expect(src).toContain("[...set.current]");
  });

  it("holds the handler in a ref, so a fresh closure does not re-register", () => {
    // All three consumers pass a new closure every render.
    expect(src).toContain("const latest = useRef(handler);");
    expect(src).toContain("return streams[pick]((row, event) => latest.current(row, event));");
    expect(src).toContain('}, [streams, pick]);');
  });

  it("is a no-op outside the provider rather than a throw", () => {
    // These components also render on public pages, where there is no shell.
    expect(src).toContain("if (!streams) return;");
  });

  it("tears the channel down with the provider", () => {
    expect(src).toContain("void supabase.removeChannel(channel);");
  });
});
