import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  inboxTitle,
  previewOf,
  INBOX_LIMIT,
  MESSAGE_COLUMNS,
  THREAD_PAGE,
  type InboxRow,
} from "../apps/mobile/src/messages/load";
import { DESTINATIONS } from "../packages/core/src/navigation";

/**
 * Messages on the phone.
 *
 * Two things here are easy to get wrong and expensive when they are: the
 * inbox query, which has a performance trap the web has already paid for
 * once, and the realtime subscription, which is the first the phone
 * makes.
 */

const WEB_ROWS = "src/app/(app)/messages/load-rows.ts";
const LOAD = "apps/mobile/src/messages/load.ts";
const INBOX = "apps/mobile/app/(tabs)/messages.tsx";
const THREAD = "apps/mobile/app/messages/[id].tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function body(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .split("\n")
    .filter((line) => !/^\s*import\b/.test(line))
    .join("\n");
}

function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const row = (over: Partial<InboxRow> & { id: string }): InboxRow => ({
  type: "dm",
  title: null,
  last_message_at: "2026-11-19T11:00:00.000Z",
  other: null,
  lastBody: null,
  lastKind: null,
  lastAt: null,
  lastSenderId: null,
  unread: 0,
  ...over,
});

const person = (over: Partial<NonNullable<InboxRow["other"]>> = {}) => ({
  id: "u1",
  display_name: "Maya Rivera",
  username: "maya",
  avatar_hue: 200,
  avatar_url: null,
  is_verified: false,
  ...over,
});

describe("the inbox query avoids the trap the web already paid for", () => {
  it("it starts from conversation_members, not from conversations", () => {
    /*
     * The web's own note: the policy on `conversations` is
     * `is_conv_member(id)`, a SECURITY DEFINER function, so the planner
     * can neither inline it nor use it as an index qual. Selecting
     * straight from conversations walks the table newest-first calling
     * that function once per row until it has found fifty you can see —
     * so someone in twenty chats paid for a walk of nearly the whole
     * table, growing with every conversation anyone else creates.
     *
     * Both halves of the fix are asserted: `!inner` makes it a join
     * rather than an embed, and the `.eq` on the JOINED column is what
     * the index serves.
     */
    const src = body(LOAD);
    expect(src).toContain("conversation_members!inner(user_id)");
    expect(src).toMatch(/\.eq\("conversation_members\.user_id", userId\)/);
    expect(code(WEB_ROWS)).toContain("conversation_members!inner(user_id)");
  });

  it("and the reason is written where someone might simplify it", () => {
    // A "simpler" query here reintroduces it on the phone only, and the
    // symptom is a slow inbox that nobody can attribute.
    expect(read(LOAD)).toMatch(/SECURITY DEFINER/);
    expect(read(LOAD)).toMatch(/index qual/);
  });

  it("the last message and unread count are counted in the database", () => {
    /*
     * Without get_inbox_summary the inbox pulls every message across all
     * fifty conversations into the app to derive two fields. The web says
     * exactly that.
     */
    const src = body(LOAD);
    expect(src).toMatch(/rpc\("get_inbox_summary", \{ p_conversation_ids: ids \}\)/);
    expect(code(WEB_ROWS)).toMatch(/get_inbox_summary/);
    expect(src, "the phone is deriving the preview from raw messages").not.toMatch(
      /from\("messages"\)[\s\S]{0,200}\.in\("conversation_id"/,
    );
  });

  it("the window is the website's fifty", () => {
    expect(INBOX_LIMIT).toBe(50);
    expect(code(WEB_ROWS)).toMatch(/\.limit\(50\)/);
  });

  it("and it asks for everyone but me, because the row is about them", () => {
    /*
     * Counted, not merely present. The loader asks this twice — once for
     * the inbox and once for a thread's header — so a check that the
     * string appears stayed green when the inbox's was flipped to `.eq`
     * and every row started showing the reader as the person they were
     * talking to. Mutation M7 found it.
     */
    const src = body(LOAD);
    expect(
      [...src.matchAll(/\.neq\("user_id", userId\)/g)].length,
      "a membership query stopped excluding the reader",
    ).toBe(2);
    expect(
      [...src.matchAll(/\.eq\("user_id", userId\)/g)].length,
      "a membership query now asks for the reader instead",
    ).toBe(0);
    expect(code(WEB_ROWS)).toMatch(/\.neq\("user_id", userId\)/);
  });
});

describe("what a row says", () => {
  it("a group uses its own title", () => {
    expect(inboxTitle(row({ id: "c", title: "Weekend plans" }))).toBe("Weekend plans");
  });

  it("a DM is the other person", () => {
    expect(inboxTitle(row({ id: "c", other: person() }))).toBe("Maya Rivera");
    expect(inboxTitle(row({ id: "c", other: person({ display_name: null }) }))).toBe("maya");
  });

  it("and a whitespace title is not a title", () => {
    expect(inboxTitle(row({ id: "c", title: "   ", other: person() }))).toBe("Maya Rivera");
  });

  it("a chat with nobody and no title still says something", () => {
    // "Conversation" is poor, and a blank row is worse — it reads as a
    // row that failed to load.
    expect(inboxTitle(row({ id: "c" }))).toBe("Conversation");
  });

  it("a chat with no messages says so", () => {
    expect(previewOf(row({ id: "c" }))).toBe("No messages yet");
  });

  it("a message this app cannot draw names its kind", () => {
    /*
     * A photo or a voice note has no body, so the preview would be
     * blank — and a blank preview reads as a failure rather than as a
     * kind of message.
     */
    expect(previewOf(row({ id: "c", lastAt: "2026-11-19T11:00:00.000Z", lastKind: "photo" }))).toBe(
      "Sent a photo",
    );
    expect(previewOf(row({ id: "c", lastAt: "2026-11-19T11:00:00.000Z", lastKind: "voice" }))).toBe(
      "Sent a voice",
    );
  });

  it("a text message is its words", () => {
    expect(
      previewOf(row({ id: "c", lastAt: "2026-11-19T11:00:00.000Z", lastKind: "text", lastBody: "hello" })),
    ).toBe("hello");
  });

  it("and an empty body still gets a line rather than nothing", () => {
    // An unsent message leaves its row behind with no body.
    expect(
      previewOf(row({ id: "c", lastAt: "2026-11-19T11:00:00.000Z", lastKind: "text", lastBody: "  " })),
    ).toBe("Message");
  });
});

describe("the thread reads the newest messages, not the oldest", () => {
  it("asked newest-first, then reversed", () => {
    /*
     * Asking oldest-first would make the LIMIT take the fifty OLDEST and
     * show a chat frozen at its beginning — which looks like a chat that
     * has not been used in months.
     */
    const src = body(LOAD);
    expect(src).toMatch(/\.order\("created_at", \{ ascending: false \}\)/);
    expect(src).toMatch(/\.slice\(\)\.reverse\(\)/);
    expect(THREAD_PAGE).toBe(50);
  });

  it("and it asks for everything a bubble draws", () => {
    /*
     * tests/mobile-columns.test.ts proves every column asked for EXISTS.
     * This is the other direction, and it is a different test: dropping
     * `removed_at` left every remaining column real, so the schema check
     * was satisfied while a removed message rendered as its original
     * text. Mutation M18 found that — the same gap search had.
     */
    for (const column of [
      "id",
      "conversation_id",
      "sender_id",
      "body",
      "kind",
      "created_at",
      "is_unsent",
      "removed_at",
    ]) {
      expect(MESSAGE_COLUMNS, `${column} is not asked for`).toMatch(
        new RegExp(`(^|[ ,])${column}([,\\s]|$)`),
      );
    }
    // And the bubble really does read each of the ones it decides on.
    const bubble = body(THREAD).slice(body(THREAD).indexOf("function Bubble("));
    expect(bubble).toMatch(/message\.is_unsent/);
    expect(bubble).toMatch(/message\.removed_at/);
    expect(bubble).toMatch(/message\.kind/);
    expect(bubble).toMatch(/message\.body/);
    expect(bubble).toMatch(/message\.created_at/);
  });

  it("and the list is inverted rather than scrolled", () => {
    /*
     * An inverted FlatList starts at the newest message with no scroll
     * call, so a chat never opens at the top and jumps — and a new
     * message extends the list where the eye already is.
     */
    expect(body(THREAD)).toMatch(/\binverted\b/);
  });
});

describe("realtime, the first subscription the phone makes", () => {
  it("filtered server-side, per conversation", () => {
    /*
     * Without the filter every message on Hypefy this account may read
     * arrives on the device and is thrown away there — the battery and
     * bandwidth of every chat nobody has open.
     */
    const src = body(THREAD);
    expect(src).toMatch(/filter: `conversation_id=eq\.\$\{id\}`/);
    expect(src).toMatch(/table: "messages"/);
    expect(src).toMatch(/event: "INSERT"/);
  });

  it("the channel is removed when the screen goes", () => {
    // A channel left open is a socket per chat ever visited.
    const src = body(THREAD);
    expect(src).toMatch(/return \(\) => \{\s*void supabase\.removeChannel\(channel\)/);
  });

  it("and the sender's own insert does not arrive twice", () => {
    /*
     * The sender receives their own row back through the channel, so a
     * message sent from this device would appear twice — once optimistic
     * and once echoed. Nothing is added locally, and the echo is
     * de-duplicated by id as well.
     */
    const src = body(THREAD);
    expect(src).toMatch(/if \(prev\.some\(\(m\) => m\.id === next\.id\)\) return prev;/);
    const send = src.slice(src.indexOf("const send = useCallback"), src.indexOf("const rows ="));
    expect(send, "the message is added locally as well as echoed").not.toMatch(/setMessages\(/);
  });
});

describe("sending", () => {
  it("through send_message, not an insert", () => {
    /*
     * The RPC owns the message row, the conversation's last_message_at
     * and the notification. An insert writes the row and leaves the
     * inbox showing the previous message as the newest one.
     */
    const src = body(LOAD);
    expect(src).toMatch(/rpc\("send_message"/);
    expect(src).toMatch(/p_conversation_id: conversationId/);
    expect(src).toMatch(/p_kind: "text"/);
    expect(src, "the phone inserts messages directly").not.toMatch(
      /from\("messages"\)[\s\S]{0,60}\.insert/,
    );
  });

  it("an empty draft sends nothing", () => {
    const src = body(THREAD);
    expect(src).toMatch(/if \(!body \|\| sending\) return;/);
  });

  it("and a failure keeps what was written", () => {
    /*
     * Throwing away someone's message because the network blinked is the
     * one failure they cannot undo.
     */
    const src = body(THREAD);
    const send = src.slice(src.indexOf("const send = useCallback"), src.indexOf("const rows ="));
    const errorAt = send.indexOf("setSendError(result.error)");
    const clearAt = send.indexOf('setDraft("")');
    expect(errorAt).toBeGreaterThan(-1);
    expect(clearAt).toBeGreaterThan(-1);
    expect(clearAt, "the draft is cleared before the failure is handled").toBeGreaterThan(errorAt);
    expect(send).toMatch(/setSendError\(result\.error\);\s*return;/);
  });
});

describe("a message this app cannot draw says what it is", () => {
  it("unsent and removed are different, and both are said", () => {
    /*
     * An unsent or removed message leaves its row behind. A blank bubble
     * reads as a message that failed to load, and the person it was sent
     * to deserves to know one was taken back rather than to wonder.
     */
    const src = body(THREAD);
    expect(src).toMatch(/This message was unsent/);
    expect(src).toMatch(/This message was removed/);
    expect(src).toMatch(/message\.is_unsent \|\| message\.removed_at/);
  });

  it("and an unsupported kind points at the web rather than rendering blank", () => {
    const src = body(THREAD);
    expect(src).toMatch(/Sent a \$\{message\.kind\} — open it on the web/);
    expect(src).toMatch(/message\.kind !== "text"/);
  });
});

describe("the screens can be reached, and left", () => {
  it("Messages is a destination in the bar", () => {
    const messages = DESTINATIONS.find((d) => d.href === "/messages");
    expect(messages?.bottomBar, "Messages left the bottom bar").toBe(true);
    expect(existsSync(INBOX)).toBe(true);
  });

  it("a row opens its thread, which exists", () => {
    expect(existsSync(THREAD)).toBe(true);
    expect(body(INBOX)).toMatch(/pathname: "\/messages\/\[id\]"/);
    expect(body(INBOX)).toMatch(/params: \{ id: row\.id \}/);
  });

  it("the thread has a back control as well as the system gesture", () => {
    const src = body(THREAD);
    expect(src).toMatch(/accessibilityLabel="Back"/);
    expect(src).toMatch(/router\.back\(\)/);
  });

  it("and its header opens the other person's profile", () => {
    const src = body(THREAD);
    expect(src).toMatch(/pathname: "\/u\/\[username\]"/);
    expect(src).toMatch(/disabled=\{!header\.other\?\.username\}/);
  });

  it("the inbox reloads on focus, or a read chat still looks unread", () => {
    /*
     * A tab navigator keeps the scene mounted, so a plain effect never
     * fires again — and coming back from a thread you have just read
     * would still show it unread.
     */
    const src = body(INBOX);
    expect(src).toMatch(/useFocusEffect\(/);
    expect(src).toMatch(/void reload\(\)/);
  });
});

describe("what is absent, and said to be", () => {
  it("a locked chat is invisible here, and the screen says so", () => {
    /*
     * The web keeps locked and hidden chats at their own levels, reached
     * by a gesture this app has no equivalent for. A chat that seems to
     * have vanished is worse than one that is explained.
     */
    const src = body(INBOX);
    expect(src).toMatch(/Locked chats are not shown here yet/);
    expect(body(LOAD), "chat levels were read without the Vault being ported").not.toMatch(
      /my_chat_levels/,
    );
  });

  it("the empty inbox tells someone what to do", () => {
    const src = body(INBOX);
    expect(src).toMatch(/No messages yet/);
    expect(src).toMatch(/profile on the web/);
  });

  it("and the rest is written where someone will read it", () => {
    const src = read(LOAD);
    for (const absent of ["Nicknames", "Reactions as the preview", "E2EE"]) {
      expect(src, `${absent} is no longer recorded as absent`).toContain(absent);
    }
    expect(read(THREAD)).toMatch(/read receipts/);
  });
});
